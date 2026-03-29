// ============================================================
//  scrape-tvlibre.js — Scraper de TV Libre
//  Fuente: tv-libre.net
//  1. Canales en vivo → colección "tvlibre_channels" en Firestore
//  2. Agenda deportiva → merge en colección "agenda"
//  VortexTV
// ============================================================

import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!rawJson) {
    try {
        rawJson = readFileSync(join(__dirname, 'service-account.json'), 'utf-8');
        console.log('ℹ️  Usando service-account.json local (modo desarrollo)');
    } catch {
        console.error('\n❌ No se encontró credencial de Firebase.');
        process.exit(1);
    }
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(rawJson);
} catch (error) {
    console.error('❌ Error parseando credenciales:', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BASE_URL = 'https://tv-libre.net';

// Categorías a filtrar (excluir)
const EXCLUDED_CATEGORIES = ['adultos (+18)', 'adultos'];

async function fetchPage(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(20000),
            });
            if (res.ok) return await res.text();
            console.warn(`⚠️  HTTP ${res.status} para ${url} (intento ${i + 1}/${retries})`);
        } catch (e) {
            console.warn(`⚠️  Error al fetch ${url} (intento ${i + 1}/${retries}): ${e.message}`);
        }
        if (i < retries - 1) await sleep(2000 * (i + 1));
    }
    return null;
}

// ─── PARTE 1: Scrapear Canales en Vivo ────────────────────────────────────────

async function scrapeChannelsList() {
    console.log('\n📺 Scrapeando lista de canales de tv-libre.net ...');
    const html = await fetchPage(BASE_URL);
    if (!html) {
        console.error('❌ No se pudo obtener la página principal');
        return [];
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Extraer todas las tarjetas de canales (links a /en-vivo/ o /eventos/sin-chat/)
    const channelLinks = document.querySelectorAll('a[href*="/en-vivo/"], a[href*="sin-chat"]');
    const channels = [];
    let currentCategory = 'Sin categoría';

    for (const link of channelLinks) {
        const href = link.getAttribute('href') || '';
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

        // Extraer nombre
        const nameEl = link.querySelector('h5, h4, h2, .card-title');
        const name = nameEl ? nameEl.textContent.trim() : '';

        // Extraer categoría del badge
        const badgeEl = link.querySelector('.badge, small, span');
        if (badgeEl) {
            const badgeText = badgeEl.textContent.trim();
            if (badgeText && badgeText !== 'Ver canal') {
                currentCategory = badgeText;
            }
        }

        // Extraer logo
        const imgEl = link.querySelector('img');
        const logo = imgEl ? imgEl.getAttribute('src') : null;
        const fullLogo = logo ? (logo.startsWith('http') ? logo : `${BASE_URL}${logo}`) : null;

        // Filtrar adultos
        if (name && !EXCLUDED_CATEGORIES.includes(currentCategory.toLowerCase())) {
            channels.push({
                name,
                url: fullUrl,
                category: currentCategory,
                logo: fullLogo,
                slug: href.includes('/en-vivo/') ? href.split('/en-vivo/')[1]?.replace(/\/$/, '') : null,
            });
        }
    }

    console.log(`   ✅ ${channels.length} canales encontrados en la lista`);
    return channels;
}

async function scrapeChannelServers(channel) {
    const html = await fetchPage(channel.url);
    if (!html) return [];

    const dom = new JSDOM(html);
    const document = dom.window.document;
    const servers = [];

    // Buscar todos los links de opciones/servidores
    const allLinks = document.querySelectorAll('a');
    for (const link of allLinks) {
        const text = (link.textContent || '').trim();
        const href = link.getAttribute('href') || '';

        // Buscar links que contengan "Opción" o que sean del patrón FL u otros reproductores
        if (text.includes('Opción') || text.includes('opción') || text.includes('Opcion')) {
            const fullHref = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            // Evitar links que apuntan a la misma página (self-referencing) sin ser servidores reales
            if (fullHref !== channel.url && !href.includes('#pc')) {
                servers.push({
                    name: text.replace(/\s+/g, ' ').trim(),
                    iframe: fullHref,
                });
            }
        }
    }

    // Si hay link FL directo, asegurar que está incluido
    const flLinks = document.querySelectorAll('a[href*="/html/fl/"]');
    for (const fl of flLinks) {
        const flHref = fl.getAttribute('href') || '';
        const fullFlHref = flHref.startsWith('http') ? flHref : `${BASE_URL}${flHref}`;
        const flText = (fl.textContent || '').trim();
        const already = servers.some(s => s.iframe === fullFlHref);
        if (!already && fullFlHref !== channel.url) {
            servers.unshift({
                name: flText || 'Opción 1 (FL)',
                iframe: fullFlHref,
            });
        }
    }

    return servers;
}

async function scrapeAllChannels() {
    const channelList = await scrapeChannelsList();
    const results = [];
    let processed = 0;

    console.log('\n🔍 Obteniendo servidores de cada canal...');
    for (const ch of channelList) {
        await sleep(500); // Rate limiting
        const servers = await scrapeChannelServers(ch);
        processed++;

        if (servers.length > 0) {
            results.push({
                name: ch.name,
                category: ch.category,
                logo: ch.logo,
                options: servers,
            });
        } else {
            // Si no encontramos servidores, al menos agregar el link directo
            results.push({
                name: ch.name,
                category: ch.category,
                logo: ch.logo,
                options: [{ name: `${ch.name} - TV Libre`, iframe: ch.url }],
            });
        }

        if (processed % 20 === 0) {
            console.log(`   📊 ${processed}/${channelList.length} canales procesados...`);
        }
    }

    console.log(`   ✅ ${results.length} canales con servidores listos`);
    return results;
}

// ─── PARTE 2: Scrapear Agenda Deportiva ───────────────────────────────────────

async function scrapeAgenda() {
    console.log('\n🏆 Scrapeando agenda deportiva de tv-libre.net/agenda/ ...');
    const html = await fetchPage(`${BASE_URL}/agenda/`);
    if (!html) {
        console.warn('⚠️  No se pudo obtener la agenda');
        return [];
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;
    const events = [];

    // La agenda está en una lista (<ul>/<li>) o tabla
    // Buscar todos los li con contenido de eventos
    const items = document.querySelectorAll('li, tr');

    for (const item of items) {
        const text = (item.textContent || '').trim();
        if (!text) continue;

        // Buscar el título del evento y hora
        // Patrón: "Evento Nombre\nHH:MM"
        const timeMatch = text.match(/(\d{1,2}:\d{2})/);
        if (!timeMatch) continue;

        const time = timeMatch[1];

        // Extraer links de canales que transmiten
        const links = item.querySelectorAll('a[href*="/en-vivo/"]');
        const servers = [];

        for (const link of links) {
            const href = link.getAttribute('href') || '';
            const channelName = (link.textContent || '').trim().replace(/Calidad \d+p/gi, '').trim();
            const fullHref = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            if (channelName && channelName !== 'tv-libre.net') {
                servers.push({
                    name: `${channelName} (TV Libre)`,
                    url: fullHref,
                });
            }
        }

        if (servers.length === 0) continue;

        // Extraer título del evento (quitar la hora y los nombres de canales)
        let title = text;
        // Limpiar: quitar hora, "Calidad 720p", nombres de canales duplicados
        title = title.replace(/\d{1,2}:\d{2}/, '').replace(/Calidad \d+p/gi, '').replace(/Ver canal/gi, '');
        // Obtener solo la primera línea significativa
        const lines = title.split('\n').map(l => l.trim()).filter(l => l.length > 5);
        title = lines[0] || text.substring(0, 80);

        // Extraer categoría del título (lo que está antes de los dos puntos)
        let category = 'Deportes';
        const colonIdx = title.indexOf(':');
        if (colonIdx > -1 && colonIdx < 30) {
            const possibleCat = title.substring(0, colonIdx).trim();
            if (possibleCat.length > 2 && possibleCat.length < 30) {
                category = possibleCat;
            }
        }

        // Evitar duplicados
        const existing = events.find(e => e.title === title);
        if (existing) {
            // Agregar servidores al evento existente
            for (const srv of servers) {
                if (!existing.servers.some(s => s.url === srv.url)) {
                    existing.servers.push(srv);
                }
            }
        } else {
            events.push({
                title: title.trim(),
                time,
                category,
                servers,
                source: 'tvlibre',
            });
        }
    }

    console.log(`   ✅ ${events.length} eventos deportivos encontrados`);
    return events;
}

// ─── PARTE 3: Subir a Firestore ──────────────────────────────────────────────

async function uploadChannels(channels) {
    console.log('\n🔥 Subiendo canales a Firestore (tvlibre_channels)...');

    // Agrupar por categoría
    const byCategory = {};
    let order = 0;
    for (const ch of channels) {
        const cat = ch.category || 'Sin categoría';
        if (!byCategory[cat]) {
            byCategory[cat] = {
                id: cat.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                name: cat,
                order: order++,
                channels: [],
            };
        }
        byCategory[cat].channels.push({
            name: ch.name,
            logo: ch.logo,
            options: ch.options,
        });
    }

    // Limpiar colección anterior
    const existing = await db.collection('tvlibre_channels').get();
    if (!existing.empty) {
        const batch = db.batch();
        existing.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`   🗑️  ${existing.size} documentos anteriores eliminados`);
    }

    // Subir nuevos
    const batch = db.batch();
    const categories = Object.values(byCategory);
    for (const cat of categories) {
        const ref = db.collection('tvlibre_channels').doc(cat.id);
        batch.set(ref, {
            name: cat.name,
            order: cat.order,
            channels: cat.channels,
            updatedAt: Date.now(),
            source: 'tvlibre',
        });
    }
    await batch.commit();
    console.log(`   ✅ ${categories.length} categorías con ${channels.length} canales subidos`);
}

async function mergeAgendaEvents(events) {
    console.log('\n🔥 Mergeando agenda con Firestore...');

    // Obtener fecha de hoy (Argentina UTC-3)
    const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
    const now = new Date(Date.now() + AR_OFFSET_MS);
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    // Obtener eventos existentes de hoy
    const snapshot = await db.collection('agenda').where('date', '==', today).get();
    const existingEvents = [];
    snapshot.forEach(doc => existingEvents.push({ id: doc.id, ...doc.data() }));

    let merged = 0;
    let added = 0;

    for (const ev of events) {
        // Buscar si ya existe un evento similar
        const match = existingEvents.find(existing => {
            const existTitle = (existing.team1 + ' vs ' + existing.team2).toLowerCase();
            const evTitle = ev.title.toLowerCase();
            // Match si los equipos aparecen en el título o viceversa
            return evTitle.includes(existing.team1?.toLowerCase()) ||
                   evTitle.includes(existing.team2?.toLowerCase()) ||
                   existTitle.includes(evTitle.split(':').pop()?.trim()?.toLowerCase() || '');
        });

        if (match) {
            // Agregar servidores de TV Libre al evento existente
            const existingServers = match.servers || [];
            const existingOpciones = match.opciones || {};
            const newServers = [...existingServers];
            const newOpciones = { ...existingOpciones };

            for (const srv of ev.servers) {
                if (!existingServers.includes(srv.url)) {
                    newServers.push(srv.url);
                }
                const opKey = srv.name || `TV Libre ${Object.keys(newOpciones).length + 1}`;
                if (!Object.values(newOpciones).includes(srv.url)) {
                    newOpciones[opKey] = srv.url;
                }
            }

            await db.collection('agenda').doc(match.id).update({
                servers: newServers,
                opciones: newOpciones,
            });
            merged++;
        } else {
            // Crear nuevo evento
            const { league, team1, team2 } = parseEventTitle(ev.title);

            const newEvent = {
                date: today,
                time: ev.time,
                category: ev.category,
                league: league || ev.category,
                team1: team1,
                team2: team2,
                logo1: null,
                logo2: null,
                status: '⚪ PROGRAMADO',
                videoUrl: ev.servers[0]?.url || null,
                servers: ev.servers.map(s => s.url),
                opciones: ev.servers.reduce((acc, srv, i) => {
                    acc[srv.name || `Opción ${i + 1}`] = srv.url;
                    return acc;
                }, {}),
                createdAt: Date.now(),
                source: 'tvlibre',
            };

            await db.collection('agenda').add(newEvent);
            added++;
        }
    }

    console.log(`   ✅ Merge completado: ${merged} mergeados, ${added} nuevos agregados`);
}

function parseEventTitle(title = '') {
    const colonIdx = title.indexOf(':');
    const league = colonIdx > -1 ? title.slice(0, colonIdx).trim() : '';
    const matchPart = colonIdx > -1 ? title.slice(colonIdx + 1).trim() : title;
    const vsMatch = matchPart.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    const team1 = vsMatch ? vsMatch[1].trim() : matchPart;
    const team2 = vsMatch ? vsMatch[2].trim() : '';
    return { league, team1, team2 };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Scraper de TV Libre iniciado\n');
    const startTime = Date.now();

    try {
        // 1. Scrapear canales
        const channels = await scrapeAllChannels();
        if (channels.length > 0) {
            await uploadChannels(channels);
        }

        // 2. Scrapear agenda
        const events = await scrapeAgenda();
        if (events.length > 0) {
            await mergeAgendaEvents(events);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Scraper completado en ${elapsed}s`);
    } catch (error) {
        console.error('❌ Error en el scraper:', error);
        process.exit(1);
    }
}

main();

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

// Categorías a excluir (adultos)
const EXCLUDED_CATEGORIES = ['adultos (+18)', 'adultos'];

// Arreglar URLs protocol-relative (//bestleague.world/...) → https://
function fixUrl(url) {
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return BASE_URL + url;
    return url;
}

async function fetchPage(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'es-AR,es;q=0.9',
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

    // Estructura HTML real de tv-libre.net:
    // <a class="canal" href="/en-vivo/telefe">
    //   <div class="canal-body">
    //     <div class="badges"><span class="badge">Argentina</span></div>
    //     <div class="logo">
    //       <img src="//bestleague.world/img/telefe.png" alt="Telefe en VIVO online" />
    //     </div>
    //     <h2 class="title">Telefe</h2>
    //   </div>
    // </a>
    const cards = document.querySelectorAll('a.canal');
    const channels = [];

    for (const card of cards) {
        const href = card.getAttribute('href') || '';
        const fullUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

        // Nombre: h2.title
        const nameEl = card.querySelector('h2.title, h2, h3');
        const name = nameEl ? nameEl.textContent.trim() : '';
        if (!name) continue;

        // Categoría: .badges .badge
        const badgeEl = card.querySelector('.badges .badge, .badge');
        const category = badgeEl ? badgeEl.textContent.trim() : 'Sin categoría';

        // Excluir adultos
        if (EXCLUDED_CATEGORIES.includes(category.toLowerCase())) continue;

        // Logo: img dentro de .logo — src tipo //bestleague.world/img/telefe.png
        const imgEl = card.querySelector('.logo img, img');
        const rawLogo = imgEl ? imgEl.getAttribute('src') : null;
        const logo = fixUrl(rawLogo);

        channels.push({ name, url: fullUrl, category, logo });
    }

    // Fallback: si no encuentra a.canal
    if (channels.length === 0) {
        console.warn('⚠️  Sin resultados con a.canal, probando a[href*="/en-vivo/"]...');
        const fallback = document.querySelectorAll('a[href*="/en-vivo/"]');
        for (const card of fallback) {
            const href = card.getAttribute('href') || '';
            const nameEl = card.querySelector('h2, h3, h5, .title');
            const name = nameEl ? nameEl.textContent.trim() : '';
            if (!name) continue;
            const badgeEl = card.querySelector('.badge, span');
            const category = badgeEl ? badgeEl.textContent.trim() : 'Sin categoría';
            if (EXCLUDED_CATEGORIES.includes(category.toLowerCase())) continue;
            const imgEl = card.querySelector('img');
            channels.push({
                name,
                url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
                category,
                logo: fixUrl(imgEl ? imgEl.getAttribute('src') : null),
            });
        }
    }

    console.log(`   ✅ ${channels.length} canales encontrados`);
    return channels;
}

async function scrapeChannelServers(channel) {
    const html = await fetchPage(channel.url);
    if (!html) return [{ name: channel.name, iframe: channel.url }];

    const dom = new JSDOM(html);
    const document = dom.window.document;
    const servers = [];
    const seen = new Set();

    for (const link of document.querySelectorAll('a')) {
        const text = (link.textContent || '').trim();
        const href = link.getAttribute('href') || '';

        if (!href || href === '#' || href.includes('#pc') || href === channel.url || href === '/') continue;

        const isOption = text.match(/opci[oó]n\s*\d*/i) ||
                         href.includes('/html/fl/') ||
                         href.includes('/eventos/sin-chat/');
        if (!isOption) continue;

        const fullHref = fixUrl(href.startsWith('http') ? href : `${BASE_URL}${href}`);
        if (!fullHref || seen.has(fullHref) || fullHref === channel.url) continue;

        seen.add(fullHref);
        servers.push({ name: text || `Opción ${servers.length + 1}`, iframe: fullHref });
    }

    if (servers.length === 0) {
        servers.push({ name: channel.name, iframe: channel.url });
    }

    return servers;
}

async function scrapeAllChannels() {
    const channelList = await scrapeChannelsList();
    if (channelList.length === 0) return [];

    const results = [];
    let processed = 0;

    console.log('\n🔍 Obteniendo servidores de cada canal...');
    for (const ch of channelList) {
        await sleep(300);
        const servers = await scrapeChannelServers(ch);
        results.push({ name: ch.name, category: ch.category, logo: ch.logo, options: servers });
        processed++;
        if (processed % 20 === 0) {
            console.log(`   📊 ${processed}/${channelList.length} canales procesados...`);
        }
    }

    console.log(`   ✅ ${results.length} canales listos`);
    return results;
}

// ─── PARTE 2: Agenda Deportiva ────────────────────────────────────────────────

async function scrapeAgenda() {
    console.log('\n🏆 Scrapeando agenda de tv-libre.net/agenda/ ...');
    const html = await fetchPage(`${BASE_URL}/agenda/`);
    if (!html) { console.warn('⚠️  Sin agenda'); return []; }

    const dom = new JSDOM(html);
    const document = dom.window.document;
    const events = [];

    for (const item of document.querySelectorAll('li, tr, .evento, .event')) {
        const text = (item.textContent || '').trim();
        if (!text || text.length < 5) continue;

        const timeMatch = text.match(/(\d{1,2}:\d{2})/);
        if (!timeMatch) continue;
        const time = timeMatch[1];

        const links = item.querySelectorAll('a[href*="/en-vivo/"]');
        const servers = [];
        for (const link of links) {
            const channelName = (link.textContent || '').trim()
                .replace(/Calidad\s*\d+p/gi, '').trim();
            const href = link.getAttribute('href') || '';
            const fullHref = href.startsWith('http') ? href : `${BASE_URL}${href}`;
            if (channelName && channelName !== 'tv-libre.net') {
                servers.push({ name: `${channelName} (TV Libre)`, url: fullHref });
            }
        }
        if (servers.length === 0) continue;

        let title = text
            .replace(/\d{1,2}:\d{2}/g, '')
            .replace(/Calidad\s*\d+p/gi, '')
            .replace(/Ver canal/gi, '')
            .split('\n').map(l => l.trim()).filter(l => l.length > 5)[0] || '';
        if (!title) continue;

        let category = 'Deportes';
        const ci = title.indexOf(':');
        if (ci > -1 && ci < 30) {
            const pc = title.substring(0, ci).trim();
            if (pc.length > 2 && pc.length < 30) category = pc;
        }

        const existing = events.find(e => e.title === title.trim());
        if (existing) {
            for (const s of servers) if (!existing.servers.some(x => x.url === s.url)) existing.servers.push(s);
        } else {
            events.push({ title: title.trim(), time, category, servers, source: 'tvlibre' });
        }
    }

    console.log(`   ✅ ${events.length} eventos`);
    return events;
}

// ─── PARTE 3: Subir a Firestore ──────────────────────────────────────────────

async function uploadChannels(channels) {
    console.log('\n🔥 Subiendo canales (tvlibre_channels)...');

    // Agrupar por categoría en orden de aparición en la página
    const categoryOrder = [];
    const byCategory = {};
    for (const ch of channels) {
        const cat = ch.category || 'Sin categoría';
        if (!byCategory[cat]) {
            const catId = cat.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            byCategory[cat] = { id: catId, name: cat, order: categoryOrder.length, channels: [] };
            categoryOrder.push(cat);
        }
        byCategory[cat].channels.push({ name: ch.name, logo: ch.logo, options: ch.options });
    }

    // Limpiar colección anterior
    const existing = await db.collection('tvlibre_channels').get();
    if (!existing.empty) {
        const batch = db.batch();
        existing.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        console.log(`   🗑️  ${existing.size} docs previos eliminados`);
    }

    // Subir en lotes de 400
    const cats = Object.values(byCategory);
    for (let i = 0; i < cats.length; i += 400) {
        const batch = db.batch();
        for (const cat of cats.slice(i, i + 400)) {
            batch.set(db.collection('tvlibre_channels').doc(cat.id), {
                name: cat.name, order: cat.order, channels: cat.channels,
                updatedAt: Date.now(), source: 'tvlibre',
            });
        }
        await batch.commit();
    }

    console.log(`   ✅ ${categoryOrder.length} categorías, ${channels.length} canales`);
}

function parseEventTitle(title = '') {
    const ci = title.indexOf(':');
    const league = ci > -1 ? title.slice(0, ci).trim() : '';
    const part = ci > -1 ? title.slice(ci + 1).trim() : title;
    const vs = part.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    return { league, team1: vs ? vs[1].trim() : part, team2: vs ? vs[2].trim() : '' };
}

async function mergeAgendaEvents(events) {
    console.log('\n🔥 Mergeando agenda...');
    const AR = -3 * 60 * 60 * 1000;
    const now = new Date(Date.now() + AR);
    const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    const snap = await db.collection('agenda').where('date', '==', today).get();
    const existing = [];
    snap.forEach(d => existing.push({ id: d.id, ...d.data() }));

    let merged = 0, added = 0;

    for (const ev of events) {
        const match = existing.find(e => {
            const t = ev.title.toLowerCase();
            const t1 = (e.team1 || '').toLowerCase();
            const t2 = (e.team2 || '').toLowerCase();
            return (t1.length > 2 && t.includes(t1)) || (t2.length > 2 && t.includes(t2));
        });

        if (match) {
            const srv = [...(match.servers || [])];
            const opc = { ...(match.opciones || {}) };
            for (const s of ev.servers) {
                if (!srv.includes(s.url)) srv.push(s.url);
                if (!Object.values(opc).includes(s.url)) opc[s.name] = s.url;
            }
            await db.collection('agenda').doc(match.id).update({ servers: srv, opciones: opc });
            merged++;
        } else {
            const { league, team1, team2 } = parseEventTitle(ev.title);
            await db.collection('agenda').add({
                date: today, time: ev.time, category: ev.category,
                league: league || ev.category, team1, team2,
                logo1: null, logo2: null, status: '⚪ PROGRAMADO',
                videoUrl: ev.servers[0]?.url || null,
                servers: ev.servers.map(s => s.url),
                opciones: ev.servers.reduce((a, s, i) => { a[s.name || `Opción ${i + 1}`] = s.url; return a; }, {}),
                createdAt: Date.now(), source: 'tvlibre',
            });
            added++;
        }
    }

    console.log(`   ✅ ${merged} mergeados, ${added} nuevos`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Scraper TV Libre\n');
    const t0 = Date.now();
    try {
        const channels = await scrapeAllChannels();
        if (channels.length > 0) await uploadChannels(channels);
        const events = await scrapeAgenda();
        if (events.length > 0) await mergeAgendaEvents(events);
        console.log(`\n✅ Completado en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

main();

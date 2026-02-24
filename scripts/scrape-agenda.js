// ============================================================
//  scrape-agenda.js — Scraper diario de tvlibree.com/agenda/
//  Actualiza la colección "agenda" en Firestore
//  Autor: VortexTV
// ============================================================

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
let serviceAccount;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } else {
        // Fallback: Si pegaron el JSON pelado dentro de .env
        const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
        serviceAccount = JSON.parse(envContent);
    }
} catch (error) {
    console.error('❌ Error leyendo las credenciales de Firebase. Verificá tu archivo .env', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Mapeo de clase CSS → ícono de deporte ────────────────────────────────────
const SPORT_ICONS = {
    FUT: '⚽',
    BAS: '🏀',
    TEN: '🎾',
    RUG: '🏉',
    BOX: '🥊',
    MOT: '🏎️',
    AUT: '🚗',
    VOL: '🏐',
    NAT: '🏊',
    ATL: '🏃',
    OTR: '🏆',
};

// ─── Mapeo de slug de canal → búsqueda en Firestore ──────────────────────────
// Clave: slug de tvlibree (ej: "tnt-sports"), Valor: términos a buscar en title
const CHANNEL_SLUG_MAP = {
    'tnt-sports': 'TNT',
    'espn': 'ESPN',
    'espn-2': 'ESPN 2',
    'espn-3': 'ESPN 3',
    'espn-4': 'ESPN 4',
    'espn-5': 'ESPN 5',
    'fox-sports': 'Fox Sports',
    'fox-sports-2': 'Fox Sports 2',
    'fox-sports-3': 'Fox Sports 3',
    'directv-sports': 'DirecTV Sports',
    'directv-sports-2': 'DirecTV Sports 2',
    'tyc-sports': 'TYC Sports',
    'caja-negra': 'Caja Negra',
    'canal-deportes': 'Canal Deportes',
    'flow-sports': 'Flow Sports',
    'win-sports': 'Win Sports',
    'ole': 'Ole',
    'star-plus': 'Star+',
    'dsports': 'DSports',
    'bein-sports': 'beIN Sports',
    'eurosport': 'Eurosport',
    'nba-tv': 'NBA TV',
    'claro-sports': 'Claro Sports',
    'cable-hogar': 'Cable Hogar',
};

// ─── TheSportsDB: obtiene el logo de un equipo ───────────────────────────────
const logoCache = {};

async function getTeamLogo(teamName) {
    if (!teamName) return null;
    if (logoCache[teamName]) return logoCache[teamName];

    try {
        const encoded = encodeURIComponent(teamName);
        const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`);
        if (!res.ok) return null;
        const data = await res.json();
        const logo = data?.teams?.[0]?.strTeamBadge || data?.teams?.[0]?.strTeamLogo || null;
        logoCache[teamName] = logo;
        return logo;
    } catch (e) {
        console.warn(`⚠️  No se encontró logo para "${teamName}":`, e.message);
        return null;
    }
}

// ─── Busca el videoUrl del canal en Firestore ─────────────────────────────────
async function findChannelVideoUrl(channelSlug, channelDisplayName) {
    try {
        // Primero intenta por el slug mapeado
        const searchTerm = CHANNEL_SLUG_MAP[channelSlug] || channelDisplayName;

        // Busca en Firestore colección "content" donde type === 'tv'
        const snapshot = await db.collection('content')
            .where('type', '==', 'tv')
            .get();

        if (snapshot.empty) return null;

        // Busca coincidencia por nombre (case-insensitive)
        const searchLower = searchTerm.toLowerCase();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.title && data.title.toLowerCase().includes(searchLower)) {
                return {
                    videoUrl: data.videoUrl,
                    servers: data.servers || [],
                    channelId: doc.id,
                };
            }
        }

        console.log(`   ⚠️  Canal no encontrado en Firestore: "${searchTerm}" (slug: ${channelSlug})`);
        return null;
    } catch (e) {
        console.error('Error buscando canal:', e.message);
        return null;
    }
}

// ─── Parsea el HTML de tvlibree ───────────────────────────────────────────────
function parseAgenda($) {
    const events = [];

    $('ul.menu > li').each((_, li) => {
        const $li = $(li);
        const sportClass = ($li.attr('class') || 'OTR').trim().toUpperCase();

        const $mainLink = $li.children('a').first();
        const $timeSpan = $mainLink.find('span').first();

        // Extraemos la hora y el texto del evento
        const timeRaw = $timeSpan.text().trim();
        $timeSpan.remove();
        const fullText = $mainLink.text().trim();

        if (!fullText || !timeRaw) return;

        // Separamos "Liga: Equipo1 vs. Equipo2"
        const colonIdx = fullText.indexOf(':');
        const league = colonIdx > -1 ? fullText.slice(0, colonIdx).trim() : 'Deporte';
        const matchPart = colonIdx > -1 ? fullText.slice(colonIdx + 1).trim() : fullText;

        const vsSep = matchPart.match(/\s+vs\.?\s+/i);
        let team1 = matchPart, team2 = '';
        if (vsSep) {
            const idx = matchPart.search(/\s+vs\.?\s+/i);
            team1 = matchPart.slice(0, idx).trim();
            team2 = matchPart.slice(idx + vsSep[0].length).trim();
        }

        // Canales del evento (dentro del ul oculto)
        const channels = [];
        $li.find('ul > li > a').each((_, a) => {
            const $a = $(a);
            const href = $a.attr('href') || '';
            const quality = $a.find('span').text().trim();
            $a.find('span').remove();
            const displayName = $a.text().trim();
            const slug = href.replace('/en-vivo/', '').replace(/\//g, '');
            channels.push({ slug, displayName, quality });
        });

        events.push({ sportClass, time: timeRaw, league, team1, team2, channels });
    });

    return events;
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de agenda deportiva...');
    console.log(`📅 Fecha: ${new Date().toLocaleDateString('es-AR')}`);

    // 1. Scrapea tvlibree.com/agenda/
    console.log('\n🌐 Descargando agenda de tvlibree.com...');
    const res = await fetch('https://tvlibree.com/agenda/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'es-AR,es;q=0.9',
        }
    });

    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // 2. Parsea los eventos
    const rawEvents = parseAgenda($);
    console.log(`✅ ${rawEvents.length} eventos encontrados`);

    if (rawEvents.length === 0) {
        console.log('⚠️  No hay eventos hoy. Limpiando agenda...');
        await clearTodayAgenda();
        return;
    }

    // 3. Enriquece cada evento con logos y videoUrl
    const today = new Date().toISOString().split('T')[0]; // "2026-02-23"
    const batch = db.batch();
    let processed = 0;

    // Borra los eventos viejos de hoy antes de escribir los nuevos
    await clearTodayAgenda();

    for (const ev of rawEvents) {
        console.log(`\n🏟️  ${ev.time} · ${ev.league}: ${ev.team1} vs ${ev.team2}`);

        // Logos de equipos (en paralelo)
        const [logo1, logo2] = await Promise.all([
            getTeamLogo(ev.team1),
            getTeamLogo(ev.team2),
        ]);

        if (logo1) console.log(`   🛡️  Logo ${ev.team1}: ✓`);
        if (logo2) console.log(`   🛡️  Logo ${ev.team2}: ✓`);

        // Primer canal disponible con videoUrl
        let videoUrl = null;
        let channelName = '';
        let channelSlug = '';
        let quality = '';
        let servers = [];

        for (const ch of ev.channels) {
            const result = await findChannelVideoUrl(ch.slug, ch.displayName);
            if (result?.videoUrl) {
                videoUrl = result.videoUrl;
                servers = result.servers;
                channelName = ch.displayName;
                channelSlug = ch.slug;
                quality = ch.quality;
                console.log(`   📺 Canal: ${channelName} ✓ (${quality})`);
                break;
            }
        }

        if (!videoUrl && ev.channels.length > 0) {
            channelName = ev.channels[0].displayName;
            channelSlug = ev.channels[0].slug;
            quality = ev.channels[0].quality;
            console.log(`   📺 Canal: ${channelName} (sin URL en Firestore)`);
        }

        // Genera ID único por día + evento
        const safeTeam1 = ev.team1.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const safeTeam2 = ev.team2.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const docId = `${today}-${safeTeam1}-vs-${safeTeam2}`;

        const docData = {
            id: docId,
            date: today,
            time: ev.time,
            sport: ev.sportClass,
            sportIcon: SPORT_ICONS[ev.sportClass] || '🏆',
            league: ev.league,
            team1: ev.team1,
            team2: ev.team2,
            logo1: logo1 || null,
            logo2: logo2 || null,
            channelName,
            channelSlug,
            videoUrl: videoUrl || null,
            servers,
            quality,
            createdAt: Date.now(),
        };

        const ref = db.collection('agenda').doc(docId);
        batch.set(ref, docData, { merge: false });
        processed++;
    }

    // 4. Escribe todo en Firestore
    await batch.commit();
    console.log(`\n✅ ${processed} eventos escritos en Firestore → colección "agenda"`);
    console.log('🎉 Scraper finalizado correctamente\n');
}

// Limpia los eventos del día actual
async function clearTodayAgenda() {
    const today = new Date().toISOString().split('T')[0];
    const snapshot = await db.collection('agenda').where('date', '==', today).get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️  ${snapshot.size} eventos anteriores de hoy eliminados`);
    }
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

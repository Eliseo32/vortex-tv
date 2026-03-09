/**
 * scrape-flow.js — Flow Argentina Live Channel Scraper
 *
 * Usa tokens de sesión ya autenticada del navegador (sin login, evita reCAPTCHA).
 * Los IDs de canales fueron descubiertos con flow-scan-ids.js.
 *
 * Uso: node scripts/scrape-flow.js
 * Tokens se actualizan cada ~24hs — copiarlos de DevTools > Network > Authorization header
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Firebase ───────────────────────────────────────────────────────────────────
let db = null;
try {
    const { default: admin } = await import('firebase-admin');
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('[Flow] Firebase ✅');
} catch (e) {
    console.warn('[Flow] Firebase no disponible — solo se mostrará en consola.\n');
}

// ══════════════════════════════════════════════════════════════════════════════
// ── TOKENS — se cargan de Firestore (config/flow_session) O de env vars ─────
// El workflow de GitHub Actions primero corre flow-refresh-tokens.js (que guarda
// tokens frescos en Firestore) y luego este script los lee automáticamente.
// Para correr manualmente: pasar FLOW_PRM_TOKEN como env var.
// ══════════════════════════════════════════════════════════════════════════════
let SESSION = {
    prmBearer: process.env.FLOW_PRM_TOKEN || '',
    deviceInfoToken: process.env.FLOW_DEVICE_TOKEN || '',
    prmSession: process.env.FLOW_PRM_SESSION || '',
    serviceSessionId: process.env.FLOW_SERVICE_SESSION || '',
};

// Si no hay tokens en env vars, cargarlos de Firestore
if (!SESSION.prmBearer && db) {
    console.log('[Flow] Cargando tokens desde Firestore (config/flow_session)...');
    try {
        const snap = await db.collection('config').doc('flow_session').get();
        if (snap.exists) {
            const data = snap.data();
            SESSION = {
                prmBearer: data.prmBearer || '',
                deviceInfoToken: data.deviceInfoToken || '',
                prmSession: data.prmSession || '',
                serviceSessionId: data.serviceSession || '',
            };
            console.log('[Flow] ✅ Tokens cargados desde Firestore (registrado:', data.registeredAt, ')');
        } else {
            console.warn('[Flow] ⚠️  No hay sesión en Firestore. Corré primero: node scripts/flow-refresh-tokens.js');
        }
    } catch (e) {
        console.warn('[Flow] No se pudo leer config/flow_session:', e.message);
    }
}

if (!SESSION.prmBearer) {
    console.error('[Flow] ❌ Sin tokens disponibles. Opciones:');
    console.error('  1. Correr: node scripts/flow-refresh-tokens.js (con FLOW_ACCESS_TOKEN)');
    console.error('  2. Pasar FLOW_PRM_TOKEN como env var');
    process.exit(1);
}

const BASE_PRM = 'https://vipprm.cvattv.com.ar:9060';
const WV_LICENSE = 'https://prm04.cvattv.com.ar:9193/policy_manager/v4/drm_proxy/Widevine';

// ── HTTP helper ────────────────────────────────────────────────────────────────
function apiFetch(urlStr, { method = 'GET', headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const lib = u.protocol === 'https:' ? https : http;
        let bodyStr = null;
        const reqHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
            ...headers,
        };
        if (body) {
            bodyStr = JSON.stringify(body);
            reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
        }
        const req = lib.request({
            hostname: u.hostname, port: u.port || 443,
            path: u.pathname + u.search, method,
            headers: reqHeaders, rejectUnauthorized: false, timeout: 15000,
        }, res => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                try { resolve({ status: res.statusCode, body: JSON.parse(raw), raw }); }
                catch { resolve({ status: res.statusCode, body: null, raw }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Get DASH stream URL for a channel ─────────────────────────────────────────
async function getStream(channelId) {
    const url = `${BASE_PRM}/policy_manager/v4/content_source/TV_CHANNEL/?` +
        `contentId=${channelId}` +
        `&serviceSessionId=${encodeURIComponent(SESSION.serviceSessionId)}` +
        `&deviceInfoToken=${encodeURIComponent(SESSION.deviceInfoToken)}`;

    const res = await apiFetch(url, {
        headers: {
            'Authorization': `Bearer ${SESSION.prmBearer}`,
            'mn-customer': '1',
            'mn-prm-session': SESSION.prmSession,
        },
    });

    // Response: { playback_resources: [{ contentUrl, playbackResourceToken, ... }] }
    const resource = res.body?.playback_resources?.[0] || res.body?.playbackResources?.[0];
    if (res.status === 200 && resource?.contentUrl) {
        return {
            mpd: resource.contentUrl,
            playbackToken: resource.playbackResourceToken || '',
        };
    }
    if (res.status !== 200 || !resource) {
        console.debug(`    [${channelId}] ${res.status}: ${res.raw.slice(0, 100)}`);
    }
    return null;
}

// ── Channel list (IDs verified via flow-scan-ids.js) ──────────────────────────
const CHANNELS = [
    // DEPORTES
    { id: '7518', name: 'ESPN', genre: 'Deportes' },
    { id: '2537', name: 'ESPN 2', genre: 'Deportes' },
    { id: '8897', name: 'ESPN 4', genre: 'Deportes' },
    { id: '3545', name: 'Fox Sports Premium', genre: 'Deportes' },
    { id: '2534', name: 'Fox Sports', genre: 'Deportes' },
    { id: '9017', name: 'Fox Sports 2', genre: 'Deportes' },
    { id: '9019', name: 'Fox Sports 3', genre: 'Deportes' },
    { id: '3543', name: 'TNT Sports', genre: 'Deportes' },
    { id: '6597', name: 'TyC Sports', genre: 'Deportes' },
    { id: '7840', name: 'PX Sports', genre: 'Deportes' },
    { id: '10317', name: 'DSports Uruguay', genre: 'Deportes' },
    { id: '10318', name: 'DSports Premium', genre: 'Deportes' },
    // NACIONAL / REGIONAL
    { id: '8237', name: 'Telefe', genre: 'Nacional' },
    { id: '7077', name: 'Canal 13', genre: 'Nacional' },
    { id: '8617', name: 'TV Pública', genre: 'Nacional' },
    { id: '6637', name: 'Canal Ciudad MDQ', genre: 'Regional' },
    { id: '1250', name: 'Canal 10 MDQ', genre: 'Regional' },
    { id: '1252', name: 'Canal 3 Rosario', genre: 'Regional' },
    { id: '1247', name: 'Canal 10 Córdoba', genre: 'Regional' },
    { id: '1246', name: 'Canal 12 Córdoba', genre: 'Regional' },
    { id: '7477', name: 'Canal 7 Bahía Blanca', genre: 'Regional' },
    // NOTICIAS
    { id: '10160', name: 'C5N', genre: 'Noticias' },
    { id: '1081', name: 'La Nación', genre: 'Noticias' },
    { id: '6617', name: 'France 24', genre: 'Noticias' },
    { id: '1024', name: 'Al Jazeera', genre: 'Noticias' },
    // ENTRETENIMIENTO / SERIES
    { id: '6877', name: 'TNT', genre: 'Entretenimiento' },
    { id: '9837', name: 'TNT Series', genre: 'Entretenimiento' },
    { id: '9139', name: 'Sony Movies', genre: 'Entretenimiento' },
    { id: '10197', name: 'AMC', genre: 'Entretenimiento' },
    { id: '9537', name: 'Adult Swim', genre: 'Entretenimiento' },
    { id: '9117', name: 'Bravo TV', genre: 'Entretenimiento' },
    { id: '9617', name: 'Universal Premiere', genre: 'Entretenimiento' },
    { id: '9618', name: 'Universal Cinema', genre: 'Entretenimiento' },
    { id: '9620', name: 'Universal Comedy', genre: 'Entretenimiento' },
    { id: '6619', name: 'Pasiones', genre: 'Entretenimiento' },
    { id: '1161', name: 'A+ Series', genre: 'Entretenimiento' },
    // PELICULAS
    { id: '1441', name: 'HBO Pop', genre: 'Peliculas' },
    { id: '8177', name: 'A+ Cine', genre: 'Peliculas' },
    // INFANTIL
    { id: '6857', name: 'Nickelodeon', genre: 'Infantil' },
    { id: '2542', name: 'NatGeo Kids', genre: 'Infantil' },
    { id: '9140', name: 'Dreamworks', genre: 'Infantil' },
    { id: '9937', name: 'Kidoo', genre: 'Infantil' },
    { id: '9657', name: 'Plim Plim', genre: 'Infantil' },
    // DOCUMENTALES
    { id: '9859', name: 'Discovery Turbo', genre: 'Documentales' },
    { id: '9678', name: 'Construir TV', genre: 'Documentales' },
    { id: '9237', name: 'DNews', genre: 'Documentales' },
    // MÚSICA
    { id: '1022', name: 'MTV Hits', genre: 'Musica' },
    { id: '1044', name: 'MTV', genre: 'Musica' },
    { id: '1021', name: 'Nick Music', genre: 'Musica' },
    { id: '8960', name: 'Flow Music 1', genre: 'Musica' },
    { id: '8961', name: 'Flow Music 2', genre: 'Musica' },
];

// ── Upload to Firestore ────────────────────────────────────────────────────────
async function upload(channels) {
    if (!db) {
        console.log('\n[Flow] Sin Firestore — canales extraídos:');
        channels.forEach(c => console.log(`  📺 ${c.name}\n     ${c.videoUrl.split('?')[0]}`));
        return;
    }
    const BATCH_SIZE = 400;
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
        const batch = db.batch();
        channels.slice(i, i + BATCH_SIZE).forEach(ch => {
            batch.set(db.collection('content').doc(`flow-${ch.channelId}`), ch, { merge: true });
        });
        await batch.commit();
    }
    console.log('[Flow] ✅ Firestore actualizado');
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
    console.log('════════════════════════════════════════════');
    console.log('   Flow Argentina — Live Channel Scraper    ');
    console.log('════════════════════════════════════════════\n');
    console.log(`[Flow] Procesando ${CHANNELS.length} canales...\n`);

    const results = [];
    let ok = 0, fail = 0;

    for (const ch of CHANNELS) {
        try {
            const stream = await getStream(ch.id);
            if (!stream) { fail++; console.log(`  ⚠️  ${ch.name} [${ch.id}]`); continue; }

            const baseUrl = stream.mpd.split('?')[0];
            const existingQuery = stream.mpd.includes('?') ? stream.mpd.split('?')[1] + '&' : '';
            const drmParams = [
                'drmType=widevine',
                `drmLicenseUrl=${encodeURIComponent(WV_LICENSE)}`,
                `drmAuthToken=${encodeURIComponent('Bearer ' + SESSION.prmBearer)}`,
                `drmReferer=${encodeURIComponent('https://portal.app.flow.com.ar/')}`,
            ].join('&');
            const videoUrl = `${baseUrl}?${existingQuery}${drmParams}`;
            const logoUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(ch.name)}&size=100&backgroundColor=1a1a2e&textColor=FACC15`;
            const posterUrl = `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(ch.name)}&size=300&backgroundColor=0d0d1a&textColor=FACC15`;

            results.push({
                // ── Campos para ContentItem (TvLiveScreen) ──────────────────
                id: `flow-${ch.id}`,
                type: 'tv',              // ← imprescindible para filter(type==='tv')
                title: ch.name,          // ← campo que renderiza la card
                genre: ch.genre,
                poster: posterUrl,       // ← imagen de la card
                backdrop: posterUrl,
                description: `Canal en vivo — ${ch.genre}`,
                year: 'LIVE',
                rating: '',
                // ── Campos extra de Flow ────────────────────────────────────
                channelId: ch.id,
                name: ch.name,
                logo: logoUrl,
                logoUrl,
                videoUrl,
                drmType: 'widevine',
                drmLicenseUrl: WV_LICENSE,
                source: 'flow',
                isLive: true,
                updatedAt: new Date().toISOString(),
            });

            ok++;
            console.log(`  ✅ ${ch.name.padEnd(24)} → ${stream.mpd.split('/').slice(-2).join('/')}`);
        } catch (e) {
            fail++;
            console.log(`  ❌ ${ch.name} — ${e.message}`);
        }
        await sleep(200);
    }

    console.log(`\n[Flow] ${ok} OK · ${fail} fallidos`);

    // Genre summary
    const byGenre = {};
    results.forEach(c => { byGenre[c.genre] = (byGenre[c.genre] || 0) + 1; });
    Object.entries(byGenre).forEach(([g, n]) => console.log(`   ${g}: ${n}`));

    if (results.length > 0) {
        await upload(results);
        const outPath = join(__dirname, '../m3u/flow_parsed.json');
        writeFileSync(outPath, JSON.stringify(results, null, 2));
        console.log(`\n[Flow] JSON guardado: m3u/flow_parsed.json`);
    }
}

main().catch(e => { console.error('\n[Flow] Error fatal:', e.message); process.exit(1); });

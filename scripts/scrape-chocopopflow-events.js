// ============================================================
//  scrape-chocopopflow-events.js — Scraper de Eventos ChocoPop Flow
//  Fuente: https://www.chocopopflow.com/feeds/posts/default?alt=json&label=Evento
//  Blogger JSON API pública (sin login requerido)
//
//  Scrapeа posts con label "Evento", extrae datos del <div class="sv-data">
//  Solo guarda eventos con status "live" o "soon" (nunca "ended")
//  Escribe en Firestore → colección "chocopopEvents"
//  VortexTV
// ============================================================

import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
        console.error('   Opción 1 (local): asegurate de tener scripts/service-account.json');
        console.error('   Opción 2 (CI): define el secret FIREBASE_SERVICE_ACCOUNT_JSON\n');
        process.exit(1);
    }
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(rawJson);
} catch (error) {
    console.error('❌ Error parseando credenciales de Firebase (JSON inválido):', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Constantes ───────────────────────────────────────────────────────────────
const BLOGGER_API = 'https://www.chocopopflow.com/feeds/posts/default?alt=json&label=Evento';
const MAX_RESULTS = 150;
const FIRESTORE_COLLECTION = 'chocopopEvents';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const logoCache = {};

// ─── Timezone Argentina (UTC-3 fijo) ─────────────────────────────────────────
function toArgentinaTime(isoUtcString) {
    const date = new Date(isoUtcString);
    const arDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const h = String(arDate.getUTCHours()).padStart(2, '0');
    const m = String(arDate.getUTCMinutes()).padStart(2, '0');
    return {
        timeAR: `${h}:${m}`,
        dateAR: arDate.toISOString().split('T')[0],
    };
}

// ─── Fetch con retry ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
            if (res.ok) return res;
            console.warn(`⚠️  HTTP ${res.status} para ${url} (intento ${i + 1}/${retries})`);
        } catch (e) {
            console.warn(`⚠️  Error al fetch ${url} (intento ${i + 1}/${retries}): ${e.message}`);
        }
        if (i < retries - 1) await sleep(2000 * (i + 1));
    }
    return null;
}

// ─── Parsea el título: "Equipo1 vs Equipo2 | Liga" ───────────────────────────
function parseTitle(title = '') {
    const pipeIdx = title.lastIndexOf('|');
    const league = pipeIdx > -1 ? title.slice(pipeIdx + 1).trim() : '';
    const matchPart = pipeIdx > -1 ? title.slice(0, pipeIdx).trim() : title.trim();
    const vsMatch = matchPart.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    const team1 = vsMatch ? vsMatch[1].trim() : matchPart;
    const team2 = vsMatch ? vsMatch[2].trim() : '';
    return { league, team1, team2 };
}

// ─── Extrae atributos data-* del div.sv-data ─────────────────────────────────
function parseSvData(htmlContent = '') {
    const extract = (attr) => {
        const match = htmlContent.match(new RegExp(`data-${attr}="([^"]*)"`, 'i'));
        return match ? match[1].replace(/\\/g, '') : null;
    };

    // Extraer descripción del primer <p> tag
    const descMatch = htmlContent.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').trim()
        : '';

    return {
        backdrop: extract('backdrop'),
        stream: extract('stream'),
        eventDate: extract('event-date'),
        eventStatus: extract('event-status'),
        genre: extract('genre'),
        year: extract('year'),
        duration: extract('duration'),
        description,
    };
}

// ─── Logo de equipo vía TheSportsDB ──────────────────────────────────────────
async function fetchLogo(name) {
    const encoded = encodeURIComponent(name);
    try {
        const res = await fetch(
            `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.teams?.length) return null;
        const team = data.teams.find(t =>
            t.strSport === 'Soccer' || t.strSport === 'Football'
        ) || data.teams[0];
        return team?.strBadge || team?.strTeamBadge || team?.strLogo || null;
    } catch { return null; }
}

async function getTeamLogo(teamName) {
    if (!teamName || teamName.length < 2) return null;
    if (logoCache[teamName]) return logoCache[teamName];
    try {
        await sleep(300);
        let logo = await fetchLogo(teamName);
        if (!logo) {
            const simplified = teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (simplified !== teamName) {
                await sleep(300);
                logo = await fetchLogo(simplified);
            }
        }
        logoCache[teamName] = logo;
        return logo;
    } catch (e) {
        console.warn(`⚠️  Sin logo para "${teamName}": ${e.message}`);
        return null;
    }
}

// ─── Fetch de todos los posts de Blogger (con paginación) ────────────────────
async function fetchAllEventPosts() {
    const posts = [];
    let startIndex = 1;

    console.log(`\n📡 Descargando posts de Blogger (label=Evento, max=${MAX_RESULTS})...`);

    while (startIndex <= MAX_RESULTS) {
        const url = `${BLOGGER_API}&max-results=25&start-index=${startIndex}`;
        const res = await fetchWithRetry(url);
        if (!res) {
            console.warn(`⚠️  No se pudo obtener posts desde índice ${startIndex}`);
            break;
        }

        const data = await res.json();
        const entries = data?.feed?.entry;
        if (!entries || entries.length === 0) {
            console.log(`   ✅ Sin más posts en índice ${startIndex}`);
            break;
        }

        posts.push(...entries);
        console.log(`   📄 ${posts.length} posts obtenidos (batch hasta índice ${startIndex + 24})`);

        if (entries.length < 25) break; // Última página
        startIndex += 25;
        await sleep(500); // Rate limiting
    }

    console.log(`   ✅ Total posts descargados: ${posts.length}`);
    return posts;
}

// ─── Limpia eventos "ended" de Firestore ─────────────────────────────────────
async function removeEndedEvents() {
    const snapshot = await db.collection(FIRESTORE_COLLECTION)
        .where('status', '==', 'ended')
        .get();

    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️  ${snapshot.size} eventos finalizados eliminados de Firestore`);
    }
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de eventos ChocoPop Flow — VortexTV');

    // 1. Obtener todos los posts de Blogger
    const posts = await fetchAllEventPosts();
    if (posts.length === 0) {
        console.warn('⚠️  No se encontraron posts. Abortando.');
        process.exit(0);
    }

    // 2. Parsear y filtrar — solo live/soon
    const events = [];
    for (const post of posts) {
        const titleRaw = post?.title?.$t || '';
        const htmlContent = post?.content?.$t || '';

        const svData = parseSvData(htmlContent);

        // Saltar eventos finalizados
        if (svData.eventStatus === 'ended') continue;
        // Saltar si no tiene stream o fecha
        if (!svData.stream || !svData.eventDate) continue;

        const { league, team1, team2 } = parseTitle(titleRaw);
        const { timeAR, dateAR } = toArgentinaTime(svData.eventDate);

        events.push({
            titleRaw,
            team1,
            team2,
            league,
            timeAR,
            dateAR,
            backdrop: svData.backdrop || null,
            videoUrl: svData.stream,
            eventDate: svData.eventDate,
            status: svData.eventStatus, // "live" | "soon"
            year: svData.year || '2026',
            description: svData.description,
        });
    }

    console.log(`\n📊 Eventos válidos (live/soon): ${events.length} de ${posts.length} posts`);

    if (events.length === 0) {
        console.log('✅ Sin eventos activos para guardar. Limpiando finalizados...');
        await removeEndedEvents();
        return;
    }

    // 3. Limpiar eventos finalizados
    await removeEndedEvents();

    // 4. Procesar logos y guardar en Firestore
    const batch = db.batch();
    let processed = 0;

    for (const ev of events) {
        console.log(`\n🏟️  [${ev.status.toUpperCase()}] ${ev.timeAR} AR · ${ev.league || 'Liga'}: ${ev.team1}${ev.team2 ? ' vs ' + ev.team2 : ''}`);

        // Logos (solo si hay dos equipos)
        let logo1 = null, logo2 = null;
        if (ev.team2) {
            [logo1, logo2] = await Promise.all([
                getTeamLogo(ev.team1),
                getTeamLogo(ev.team2),
            ]);
            if (logo1) console.log(`   🛡️  Logo ${ev.team1}: ✓`);
            if (logo2) console.log(`   🛡️  Logo ${ev.team2}: ✓`);
        }

        // ID único basado en fecha AR + equipos
        const safe = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').slice(0, 24);
        const safeTime = (ev.timeAR || '').replace(':', '');
        const docId = `${ev.dateAR}-${safeTime}-${safe(ev.team1)}-vs-${safe(ev.team2)}`;

        const docData = {
            id: docId,
            title: ev.titleRaw,
            team1: ev.team1,
            team2: ev.team2,
            league: ev.league,
            backdrop: ev.backdrop,
            videoUrl: ev.videoUrl,
            eventDate: ev.eventDate,      // ISO UTC original (para countdown exacto)
            timeAR: ev.timeAR,            // HH:MM en Argentina
            dateAR: ev.dateAR,            // YYYY-MM-DD en Argentina
            status: ev.status,            // "live" | "soon"
            logo1: logo1 || null,
            logo2: logo2 || null,
            description: ev.description || '',
            year: ev.year,
            createdAt: Date.now(),
        };

        const ref = db.collection(FIRESTORE_COLLECTION).doc(docId);
        batch.set(ref, docData, { merge: true });
        processed++;
    }

    // 5. Escribir en Firestore
    await batch.commit();
    console.log(`\n✅ ${processed} eventos escritos en Firestore → colección "${FIRESTORE_COLLECTION}"`);
    console.log('🎉 Scraper de eventos ChocoPop Flow finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

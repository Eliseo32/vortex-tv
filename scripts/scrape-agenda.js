// ============================================================
//  scrape-agenda.js — Scraper de Agenda Deportiva
//  Fuente: angulismotv-dnh.pages.dev (APIs de Cloudflare Workers)
//  Actualiza la colección "agenda" en Firestore
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
// En GitHub Actions usa el secret FIREBASE_SERVICE_ACCOUNT_JSON
// En local usa service-account.json del mismo directorio (fallback automático)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const logoCache = {};

// ─── Timezone Argentina (UTC-3, sin cambio de horario) ───────────────────────
// GitHub Actions corre en UTC. Argentina es UTC-3 fijo.
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

function nowAR() {
    return new Date(Date.now() + AR_OFFSET_MS);
}

/** Devuelve la fecha de hoy en Argentina: "2025-03-15" */
function todayAR() {
    const d = nowAR();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Devuelve hora y fecha locales en Argentina para logs */
function logDateAR() {
    const d = nowAR();
    return d.toUTCString().replace('GMT', 'ART (-3)');
}

/**
 * Suma horas a un string "HH:MM".
 * La API de angulismotv devuelve los horarios en UTC-5 (Colombia/México).
 * Argentina es UTC-3  →  hay que sumar +2 horas.
 */
function addHoursToTime(timeStr, hours) {
    if (!timeStr || !timeStr.includes(':')) return timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const total = h + hours;
    const newH = ((total % 24) + 24) % 24; // wrap around midnight
    return `${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const API_TO_AR_OFFSET = 2; // API en UTC-5, Argentina UTC-3 → +2h
// TheSportsDB: obtiene el escudo de un equipo
async function fetchLogo(name) {
    const encoded = encodeURIComponent(name);
    try {
        const res = await fetch(
            `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.teams?.length) return null;
        const soccerTeam = data.teams.find(t =>
            t.strSport === 'Soccer' || t.strSport === 'Football'
        ) || data.teams[0];
        return soccerTeam?.strBadge || soccerTeam?.strTeamBadge || soccerTeam?.strLogo || null;
    } catch { return null; }
}

async function getTeamLogo(teamName) {
    if (!teamName || teamName.length < 2) return null;
    if (logoCache[teamName]) return logoCache[teamName];
    try {
        await sleep(300);
        let logo = await fetchLogo(teamName);
        // Fallback: normalizar tildes
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

// ─── Parsea el título: "Liga: Equipo1 vs Equipo2" ────────────────────────────
function parseTitle(title = '') {
    const colonIdx = title.indexOf(':');
    const league = colonIdx > -1 ? title.slice(0, colonIdx).trim() : '';
    const matchPart = colonIdx > -1 ? title.slice(colonIdx + 1).trim() : title;
    const vsMatch = matchPart.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    const team1 = vsMatch ? vsMatch[1].trim() : matchPart;
    const team2 = vsMatch ? vsMatch[2].trim() : '';
    return { league, team1, team2 };
}

// Ícono de deporte según categoría
function getSportIcon(category = '', league = '') {
    const text = (category + ' ' + league).toLowerCase();
    if (text.includes('fútbol') || text.includes('futbol') || text.includes('soccer') || text.includes('liga') || text.includes('copa') || text.includes('premier') || text.includes('champions')) return '⚽';
    if (text.includes('f1') || text.includes('formula') || text.includes('motogp') || text.includes('wrc')) return '🏎️';
    if (text.includes('nba') || text.includes('basket')) return '🏀';
    if (text.includes('tenis')) return '🎾';
    if (text.includes('béisbol') || text.includes('beisbol') || text.includes('mlb')) return '⚾';
    if (text.includes('rugby')) return '🏉';
    if (text.includes('ufc') || text.includes('box')) return '🥊';
    return '🏆';
}

// ─── Limpia la agenda del día ─────────────────────────────────────────────────
async function clearTodayAgenda() {
    const today = todayAR();
    const snapshot = await db.collection('agenda').where('date', '==', today).get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️  ${snapshot.size} eventos anteriores de hoy eliminados`);
    }
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

// ─── Fuente 1: Eventos automáticos (streamtp) ─────────────────────────────────
async function fetchAutoEvents() {
    console.log('\n📡 Fuente 1: streamtp.angulismotv.workers.dev/eventos.json');
    const res = await fetchWithRetry('https://streamtp.angulismotv.workers.dev/eventos.json');
    if (!res) {
        console.warn('⚠️  No se pudo obtener eventos automáticos');
        return [];
    }
    const data = await res.json();
    console.log(`   ✅ ${data.length} filas encontradas`);

    // Agrupar por título para combinar servidores del mismo partido
    const grouped = {};
    for (const ev of data) {
        if (!ev.title || !ev.link) continue;
        const key = ev.title.toLowerCase().trim();
        if (!grouped[key]) {
            grouped[key] = {
                title: ev.title,
                time: ev.time || '',
                category: ev.category || 'Other',
                status: ev.status || 'programado',
                servers: [],
            };
        }
        grouped[key].servers.push(ev.link);
    }

    return Object.values(grouped).map(ev => ({
        ...ev,
        time: addHoursToTime(ev.time, API_TO_AR_OFFSET),
    }));
}

// ─── Fuente 2: Eventos manuales (euents) ─────────────────────────────────────
async function fetchManualEvents() {
    console.log('\n📡 Fuente 2: json.angulismotv.workers.dev/euents');
    const res = await fetchWithRetry('https://json.angulismotv.workers.dev/euents');
    if (!res) {
        console.warn('⚠️  No se pudo obtener eventos manuales');
        return [];
    }
    const data = await res.json();
    console.log(`   ✅ ${data.length} eventos manuales encontrados`);

    return data.map(ev => {
        // Extraer todos los iframes de todos los canales y opciones
        const servers = [];
        if (Array.isArray(ev.canales)) {
            for (const canal of ev.canales) {
                if (Array.isArray(canal.options)) {
                    for (const opt of canal.options) {
                        if (opt.iframe && !opt.iframe.startsWith('undefined')) {
                            servers.push(opt.iframe);
                        }
                    }
                }
            }
        }
        return {
            title: ev.evento || '',
            time: addHoursToTime(ev.fecha ? ev.fecha.split(' ')[1]?.slice(0, 5) : '', API_TO_AR_OFFSET),
            category: ev.competencia || 'Other',
            status: 'programado',
            servers,
            isManual: true,
        };
    }).filter(ev => ev.title && ev.servers.length > 0);
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de agenda — VortexTV (AngulismoTV)');
    console.log(`📅 Fecha Argentina: ${todayAR()} — ${logDateAR()}`);

    // 1. Obtener eventos de ambas fuentes
    const [autoEvents, manualEvents] = await Promise.all([
        fetchAutoEvents(),
        fetchManualEvents(),
    ]);

    // 2. Combinar y deduplicar (manuales tienen prioridad)
    const allMap = new Map();
    for (const ev of autoEvents) {
        const key = ev.title.toLowerCase().trim();
        allMap.set(key, { ...ev, source: 'auto' });
    }
    for (const ev of manualEvents) {
        const key = ev.title.toLowerCase().trim();
        if (allMap.has(key)) {
            // Combinar servidores
            const existing = allMap.get(key);
            existing.servers = [...new Set([...ev.servers, ...existing.servers])];
            existing.source = 'combined';
        } else {
            allMap.set(key, { ...ev, source: 'manual' });
        }
    }

    const events = Array.from(allMap.values());
    console.log(`\n📊 Total de eventos únicos: ${events.length}`);

    if (events.length === 0) {
        console.log('⚠️  No hay eventos para hoy.');
        await clearTodayAgenda();
        return;
    }

    // 3. Limpiar eventos viejos
    await clearTodayAgenda();

    // 4. Procesar cada evento
    const today = todayAR();
    const batch = db.batch();
    let processed = 0;

    for (const ev of events) {
        const { league, team1, team2 } = parseTitle(ev.title);
        const sportIcon = getSportIcon(ev.category, league);
        const videoUrl = ev.servers[0] || null;

        const isLive = (ev.status || '').toLowerCase().includes('vivo') ||
            (ev.status || '').toLowerCase().includes('live');

        console.log(`\n🏟️  ${ev.time} · ${league || ev.category}: ${team1}${team2 ? ' vs ' + team2 : ''}`);
        console.log(`   🔗 ${ev.servers.length} servidores | ${isLive ? '🔴 EN VIVO' : '⚪ Programado'}`);

        // Logos (solo para fútbol con dos equipos)
        let logo1 = null, logo2 = null;
        if (team2 && (ev.category === 'Soccer' || league)) {
            [logo1, logo2] = await Promise.all([
                getTeamLogo(team1),
                getTeamLogo(team2),
            ]);
            if (logo1) console.log(`   🛡️  Logo ${team1}: ✓`);
            if (logo2) console.log(`   🛡️  Logo ${team2}: ✓`);
        }

        // ID único por día + partido
        const safe = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 28);
        const safeTime = (ev.time || '').replace(':', '');
        const docId = `${today}-${safeTime}-${safe(team1)}-vs-${safe(team2)}`;

        const docData = {
            id: docId,
            date: today,
            time: ev.time || '',
            category: ev.category || league || 'Deporte',
            league: league || ev.category || '',
            team1,
            team2,
            logo1: logo1 || null,
            logo2: logo2 || null,
            sportIcon,
            status: isLive ? '🔴 EN VIVO' : '⚪ PROGRAMADO',
            videoUrl,
            servers: ev.servers,
            source: ev.source || 'auto',
            createdAt: Date.now(),
        };

        const ref = db.collection('agenda').doc(docId);
        batch.set(ref, docData, { merge: false });
        processed++;
    }

    // 5. Escribir en Firestore
    await batch.commit();
    console.log(`\n✅ ${processed} eventos escritos en Firestore → colección "agenda"`);
    console.log('🎉 Scraper finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

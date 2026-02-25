// ============================================================
//  scrape-agenda.js — Scraper de nowfutbol.xyz/app/
//  Actualiza la colección "agenda" en Firestore
//  VortexTV
// ============================================================

import fetch from 'node-fetch';
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
        const envContent = readFileSync(join(__dirname, '.env'), 'utf-8');
        serviceAccount = JSON.parse(envContent);
    }
} catch (error) {
    console.error('❌ Error leyendo credenciales de Firebase:', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── TheSportsDB: obtiene el escudo de un equipo ─────────────────────────────
const logoCache = {};

async function getTeamLogo(teamName) {
    if (!teamName || teamName.length < 2) return null;
    if (logoCache[teamName]) return logoCache[teamName];

    try {
        const encoded = encodeURIComponent(teamName);
        const res = await fetch(
            `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encoded}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const logo = data?.teams?.[0]?.strTeamBadge || data?.teams?.[0]?.strTeamLogo || null;
        logoCache[teamName] = logo;
        return logo;
    } catch (e) {
        console.warn(`⚠️  Sin logo para "${teamName}": ${e.message}`);
        return null;
    }
}

// ─── Parsea el título: "Liga: Equipo1 vs. Equipo2" ───────────────────────────
function parseTitle(title = '') {
    // Formato esperado: "Liga: Equipo1 vs. Equipo2"
    const colonIdx = title.indexOf(':');
    const league = colonIdx > -1 ? title.slice(0, colonIdx).trim() : '';
    const matchPart = colonIdx > -1 ? title.slice(colonIdx + 1).trim() : title;

    const vsMatch = matchPart.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    const team1 = vsMatch ? vsMatch[1].trim() : matchPart;
    const team2 = vsMatch ? vsMatch[2].trim() : '';

    return { league, team1, team2 };
}

// ─── Filtra opciones descartando links inútiles ───────────────────────────────
function cleanOpciones(opciones = {}) {
    const SKIP = ['googletagmanager', 'analytics', 'gtag'];
    const clean = {};
    for (const [key, url] of Object.entries(opciones)) {
        if (!url || typeof url !== 'string') continue;
        if (SKIP.some(s => url.includes(s))) continue;
        clean[key] = url;
    }
    return clean;
}

// ─── Limpia la agenda del día actual ─────────────────────────────────────────
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

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de nowfutbol.xyz...');
    console.log(`📅 Fecha: ${new Date().toLocaleDateString('es-AR')}`);

    // 1. Descarga el JSON de nowfutbol
    console.log('\n🌐 Descargando combined_events.json...');
    const res = await fetch('https://nowfutbol.xyz/app/combined_events.json', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, */*',
            'Referer': 'https://nowfutbol.xyz/app/',
        }
    });

    if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
    const events = await res.json();
    console.log(`✅ ${events.length} eventos encontrados`);

    if (events.length === 0) {
        console.log('⚠️  No hay eventos hoy.');
        await clearTodayAgenda();
        return;
    }

    // 2. Limpia los eventos viejos
    await clearTodayAgenda();

    // 3. Procesa cada evento
    const today = new Date().toISOString().split('T')[0];
    const batch = db.batch();
    let processed = 0;

    for (const ev of events) {
        const { league, team1, team2 } = parseTitle(ev.title);
        const opciones = cleanOpciones(ev.opciones);
        const servers = Object.values(opciones); // Array de URLs
        const videoUrl = servers[0] || null;     // Primer servidor como principal

        console.log(`\n🏟️  ${ev.time} · ${league}: ${team1} vs ${team2}`);
        console.log(`   🔗 ${servers.length} servidores disponibles`);

        // Logos en paralelo
        const [logo1, logo2] = await Promise.all([
            getTeamLogo(team1),
            getTeamLogo(team2),
        ]);
        if (logo1) console.log(`   🛡️  Logo ${team1}: ✓`);
        if (logo2) console.log(`   🛡️  Logo ${team2}: ✓`);

        // ID único por día + partido
        const safeTeam1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const safeTeam2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        const safeTime = (ev.time || '').replace(':', '');
        const docId = `${today}-${safeTime}-${safeTeam1}-vs-${safeTeam2}`;

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
            status: ev.status || '⚪ PROGRAMADO',
            videoUrl,
            servers,                // Todos los servidores como array
            opciones,               // Mapa "Opción 1" → URL (para mostrar en la app)
            createdAt: Date.now(),
        };

        const ref = db.collection('agenda').doc(docId);
        batch.set(ref, docData, { merge: false });
        processed++;
    }

    // 4. Escribe en Firestore
    await batch.commit();
    console.log(`\n✅ ${processed} eventos escritos en Firestore → colección "agenda"`);
    console.log('🎉 Scraper finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

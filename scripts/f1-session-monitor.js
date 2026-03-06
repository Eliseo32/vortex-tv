// f1-session-monitor.js
// Chequea si hay una sesión F1 activa y actualiza Firestore

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Firebase init ────────────────────────────────────────────────────────────
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    serviceAccount = require(join(__dirname, 'service-account.json'));
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Fetch telemetría ─────────────────────────────────────────────────────────
const MV_BASE = 'https://api.multiviewer.app/api/v1';

async function getSessionState() {
    const res = await fetch(`${MV_BASE}/live-timing/state`, {
        timeout: 8000,
        headers: { 'User-Agent': 'VortexTV/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function getUpcomingSessions() {
    const res = await fetch('https://api.f1telemetry.com/api/upcoming', {
        timeout: 8000,
        headers: { 'User-Agent': 'VortexTV/1.0' },
    });
    if (!res.ok) return [];
    return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
try {
    let isLive = false;
    let sessionData = {};
    let nextSession = null;

    // Chequear sesión en vivo
    try {
        const liveState = await getSessionState();
        if (liveState?.SessionInfo && liveState?.TimingData) {
            isLive = true;
            const si = liveState.SessionInfo;
            const lapData = liveState.LapCount || {};
            sessionData = {
                isLive: true,
                sessionName: si.Name || '',
                gp: si.Meeting?.OfficialName || `Gran Premio de ${si.Meeting?.Country?.Name || ''}`,
                circuitName: si.Meeting?.Circuit?.ShortName || '',
                countryName: si.Meeting?.Country?.Name || '',
                currentLap: lapData.CurrentLap || 0,
                totalLaps: lapData.TotalLaps || 0,
                flag: liveState.TrackStatus?.Status || 'AllClear',
                updatedAt: new Date().toISOString(),
            };
        }
    } catch (e) {
        console.log('No hay sesión en vivo:', e.message);
    }

    // Si no hay sesión en vivo, buscar la próxima
    if (!isLive) {
        try {
            const upcoming = await getUpcomingSessions();
            if (upcoming?.length > 0) {
                const next = upcoming[0];
                nextSession = {
                    name: next.session_name || next.name || '',
                    startTime: next.start_time || next.startTime || '',
                    gp: next.gp_name || next.event || '',
                    country: next.country || '',
                };
            }
        } catch (e) {
            console.log('Error buscando próxima sesión:', e.message);
        }

        sessionData = {
            isLive: false,
            nextSession,
            updatedAt: new Date().toISOString(),
        };
    }

    // Guardar en Firestore
    await db.collection('f1').doc('currentSession').set(sessionData, { merge: true });

    console.log('✅ Firestore actualizado:', JSON.stringify(sessionData, null, 2));
    process.exit(0);
} catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
}

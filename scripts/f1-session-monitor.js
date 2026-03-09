// f1-session-monitor.js
// Chequea si hay una sesión F1 activa y actualiza Firestore
// Usa api.f1telemetry.com como fuente principal (confirmado funcionando)

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

// ─── APIs ─────────────────────────────────────────────────────────────────────
const F1T_BASE = 'https://api.f1telemetry.com';
const MV_BASE = 'https://api.multiviewer.app/api/v1';

async function fetchJSON(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'VortexTV/1.0' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
try {
    let isLive = false;
    let sessionData = {};
    let nextSession = null;

    // 1. Chequear sesión en vivo (MultiViewer - tiene datos detallados)
    try {
        const liveState = await fetchJSON(`${MV_BASE}/live-timing/state`);
        if (liveState?.SessionInfo && liveState?.TimingData) {
            isLive = true;
            const si = liveState.SessionInfo;
            const lapData = liveState.LapCount || {};
            const status = liveState.SessionStatus?.Status;
            sessionData = {
                isLive: status !== 'Finalised' && status !== 'Ends',
                isFinalised: status === 'Finalised' || status === 'Ends',
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
        console.log('MultiViewer no disponible, usando f1telemetry.com:', e.message);
    }

    // 2. Siempre obtener próxima sesión de f1telemetry.com
    try {
        const upcoming = await fetchJSON(`${F1T_BASE}/upcoming`);
        if (upcoming?.success && upcoming?.nextEvent) {
            const ev = upcoming.nextEvent;
            nextSession = {
                name: ev.type || '',
                startTime: ev.start || '',
                endTime: ev.end || '',
                gp: ev.track || '',
                location: ev.location || '',
                countdownMinutes: upcoming.timeUntilNext?.totalMinutes || 0,
            };
        }
    } catch (e) {
        console.log('Error f1telemetry.com/upcoming:', e.message);
    }

    // 3. Construir documento final
    if (!isLive) {
        sessionData = {
            isLive: false,
            isFinalised: false,
            nextSession,
            updatedAt: new Date().toISOString(),
        };
    } else {
        sessionData.nextSession = nextSession;
    }

    // 4. Guardar en Firestore
    await db.collection('f1').doc('currentSession').set(sessionData, { merge: true });

    console.log('✅ Firestore actualizado:', JSON.stringify(sessionData, null, 2));
    process.exit(0);
} catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
}

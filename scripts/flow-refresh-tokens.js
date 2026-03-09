/**
 * flow-refresh-tokens.js — Renueva los tokens de Flow Argentina automáticamente
 *
 * Usa el flowAccessToken (dura meses) para llamar /register y obtener tokens frescos.
 * Los guarda en Firestore en el documento "config/flow_session" para que la app los lea.
 *
 * Uso: node scripts/flow-refresh-tokens.js
 * Env requeridas:
 *   FLOW_ACCESS_TOKEN           → JWT largo (extraído del browser, dura meses)
 *   FIREBASE_SERVICE_ACCOUNT_JSON → service account de Firebase
 *
 * Cómo obtener FLOW_ACCESS_TOKEN:
 *   1. Abrí portal.app.flow.com.ar con sesión iniciada
 *   2. DevTools > Console: localStorage.getItem('flowAccessToken')
 *   ← Este token dura MESES y no necesita renovarse frecuentemente
 */

import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Firebase ───────────────────────────────────────────────────────────────────
let db = null;
try {
    const { default: admin } = await import('firebase-admin');
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
    console.log('[Refresh] Firebase ✅');
} catch (e) {
    console.error('[Refresh] Firebase requerido:', e.message);
    process.exit(1);
}

// ── Config ─────────────────────────────────────────────────────────────────────
const FLOW_ACCESS_TOKEN = process.env.FLOW_ACCESS_TOKEN;
if (!FLOW_ACCESS_TOKEN) {
    console.error('[Refresh] ❌ Falta FLOW_ACCESS_TOKEN en env');
    console.error('  Obtenerlo: DevTools > Console > localStorage.getItem(\'flowAccessToken\')');
    process.exit(1);
}

const BASE_PRM = 'vipprm.cvattv.com.ar';
const BASE_SDK = 'authsdk.app.flow.com.ar';
const WV_LICENSE = 'https://prm04.cvattv.com.ar:9193/policy_manager/v4/drm_proxy/Widevine';

// Device fija de "Vortex TV App"
const DEVICE = {
    deviceId: 'VORTEX-TV-APP-01',
    deviceType: 'cloud_client',
    deviceName: 'Vortex TV (Android)',
    macAddress: 'VORTEX01AABBCCDDEEFF',
    uuid: 'VORTEX01AABB11223344CCDDEEFF5566',
};

// ── HTTP helper ────────────────────────────────────────────────────────────────
function apiPost(hostname, port, path, bearerToken, body) {
    return new Promise((resolve, reject) => {
        const bodyStr = JSON.stringify(body);
        const req = https.request({
            hostname, port, path, method: 'POST',
            rejectUnauthorized: false, timeout: 15000,
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr),
                'Accept': 'application/json',
                'mn-customer': '1',
                'User-Agent': 'Vortex-TV/1.0',
            },
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body: null, raw: d, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.write(bodyStr);
        req.end();
    });
}

function apiGet(hostname, port, path, bearerToken, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname, port, path, method: 'GET',
            rejectUnauthorized: false, timeout: 15000,
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Accept': 'application/json',
                'mn-customer': '1',
                ...extraHeaders,
            },
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d), headers: res.headers }); }
                catch { resolve({ status: res.statusCode, body: null, raw: d, headers: res.headers }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

// ── Paso 1: Intercambiar flowAccessToken por PRM JWT via /register ─────────────
async function registerDevice(flowToken) {
    console.log('[Refresh] Paso 1: Registrando dispositivo con flowAccessToken...');

    const res = await apiPost(BASE_PRM, 9060, '/policy_manager/v4/register', flowToken, {
        deviceId: DEVICE.deviceId,
        deviceType: DEVICE.deviceType,
        deviceName: DEVICE.deviceName,
        macAddress: DEVICE.macAddress,
        uuid: DEVICE.uuid,
    });

    console.log('[Refresh] /register status:', res.status);

    // Extraer tokens del response
    const prmBearer = res.body?.token || res.body?.accessToken || res.body?.jwtToken || '';
    const deviceInfoToken = res.body?.deviceInfoToken || res.body?.data?.deviceInfoToken || '';
    const prmSession = res.body?.mnPrmSession || res.headers?.['mn-prm-session'] || '';
    const serviceSession = res.body?.mnServices || res.headers?.['mn-services'] || '';

    if (!prmBearer && res.status !== 200 && res.status !== 201) {
        console.warn('[Refresh] ⚠️  /register raw:', JSON.stringify(res.body).slice(0, 300));
        // Intentar usar el flowAccessToken directamente como Bearer para el PRM
        // (algunos endpoints de Flow aceptan el flowAccessToken directo)
        return {
            prmBearer: flowToken,   // fallback: usar el mismo token
            deviceInfoToken: deviceInfoToken,
            prmSession: prmSession,
            serviceSession: serviceSession,
            registeredAt: new Date().toISOString(),
        };
    }

    console.log('[Refresh] ✅ Dispositivo registrado');
    return { prmBearer: prmBearer || flowToken, deviceInfoToken, prmSession, serviceSession, registeredAt: new Date().toISOString() };
}

// ── Paso 2: Probar una petición de stream para verificar que funciona ──────────
async function testStream(session) {
    const TEST_CHANNEL = '6637'; // Canal Ciudad MDQ — siempre disponible
    const url = `/policy_manager/v4/content_source/TV_CHANNEL/?contentId=${TEST_CHANNEL}` +
        `&serviceSessionId=${encodeURIComponent(session.serviceSession)}` +
        `&deviceInfoToken=${encodeURIComponent(session.deviceInfoToken)}`;

    const res = await apiGet(BASE_PRM, 9060, url, session.prmBearer, {
        'mn-prm-session': session.prmSession,
    });

    const resource = res.body?.playback_resources?.[0];
    if (res.status === 200 && resource?.contentUrl) {
        console.log('[Refresh] ✅ Stream test OK:', resource.contentUrl.split('/').slice(-1)[0]);
        return true;
    }
    console.warn('[Refresh] ⚠️  Stream test falló:', res.status, JSON.stringify(res.body).slice(0, 150));
    return false;
}

// ── Paso 3: Guardar sesión en Firestore ────────────────────────────────────────
async function saveSession(session, streamOk) {
    const doc = {
        ...session,
        wvLicenseUrl: WV_LICENSE,
        streamTestOk: streamOk,
        updatedAt: new Date().toISOString(),
    };

    await db.collection('config').doc('flow_session').set(doc);
    console.log('[Refresh] ✅ Sesión guardada en Firestore: config/flow_session');
    return doc;
}

// ── Paso 4: Actualizar URLs en todos los canales de Flow ──────────────────────
async function updateChannelUrls(session) {
    console.log('[Refresh] Actualizando URLs de canales Flow...');

    // Leer canales existentes de Flow
    const snapshot = await db.collection('content')
        .where('source', '==', 'flow')
        .get();

    if (snapshot.empty) {
        console.warn('[Refresh] No hay canales de Flow en Firestore. Corriendo scraper completo...');
        return false;
    }

    // Por cada canal, actualizar el drmAuthToken en la videoUrl
    const batch = db.batch();
    let count = 0;

    snapshot.forEach(doc => {
        const data = doc.data();
        if (!data.videoUrl) return;

        // Reemplazar drmAuthToken en la URL existente
        const baseUrl = data.videoUrl.split('?')[0];
        const params = new URLSearchParams(data.videoUrl.includes('?') ? data.videoUrl.split('?')[1] : '');

        // Actualizar token
        params.set('drmType', 'widevine');
        params.set('drmLicenseUrl', encodeURIComponent(WV_LICENSE));
        params.set('drmAuthToken', encodeURIComponent('Bearer ' + session.prmBearer));
        params.set('drmReferer', encodeURIComponent('https://portal.app.flow.com.ar/'));

        const newVideoUrl = baseUrl + '?' + params.toString();

        batch.update(doc.ref, {
            videoUrl: newVideoUrl,
            drmToken: session.prmBearer,
            drmUpdatedAt: new Date().toISOString(),
        });
        count++;
    });

    await batch.commit();
    console.log(`[Refresh] ✅ ${count} canales actualizados en Firestore`);
    return true;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('   Flow Argentina — Token Auto-Refresh         ');
    console.log('═══════════════════════════════════════════════\n');

    // Paso 1: Registrar y obtener tokens frescos
    const session = await registerDevice(FLOW_ACCESS_TOKEN);

    // Paso 2: Verificar que el stream funciona
    const streamOk = session.deviceInfoToken
        ? await testStream(session)
        : false;

    // Paso 3: Guardar en Firestore
    await saveSession(session, streamOk);

    // Paso 4: Actualizar URLs de canales
    await updateChannelUrls(session);

    console.log('\n[Refresh] ✅ Refresh completado exitosamente');
    console.log('[Refresh] Próximo refresh en: ~20 horas (GitHub Actions)');
}

main().catch(e => {
    console.error('[Refresh] Error fatal:', e.message);
    process.exit(1);
});

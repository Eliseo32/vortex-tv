// ============================================================
//  scrape-chocopopflow.js — Scraper de ChocoPop TV
//  Fuente: http://tv.chocopopflow.com/?m=0
//  Extrae: var Streams = [...] del HTML de la página
//  Guarda: colección "chocopopChannels" en Firestore
//  VortexTV
// ============================================================

import fetch from 'node-fetch';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!rawJson) {
    const localKeyPath = join(__dirname, 'service-account.json');
    if (fs.existsSync(localKeyPath)) {
        rawJson = fs.readFileSync(localKeyPath, 'utf8');
        console.log('🗝️  Usando credenciales locales (service-account.json)');
    } else {
        console.error('\n❌ FIREBASE_SERVICE_ACCOUNT_JSON no encontrada.');
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

const SOURCE_URL = 'http://tv.chocopopflow.com/?m=0';
const COLLECTION = 'chocopopChannels';

// ─── Fetch del HTML de ChocoPop ──────────────────────────────────────────────
async function fetchChocopopHTML() {
    console.log(`\n🌐 Descargando HTML de ${SOURCE_URL}...`);

    // Intento 1: directo
    try {
        const res = await fetch(SOURCE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
            },
            timeout: 15000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        console.warn(`⚠️  Petición directa falló: ${err.message}`);
    }

    // Intento 2: via AllOrigins proxy
    try {
        console.log('🔄 Intentando via AllOrigins proxy...');
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(SOURCE_URL)}`;
        const res = await fetch(proxyUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        console.warn(`⚠️  AllOrigins también falló: ${err.message}`);
    }

    // Intento 3: via cors-anywhere (solo en emergencia)
    try {
        console.log('🔄 Intentando via cors-anywhere...');
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${SOURCE_URL}`;
        const res = await fetch(proxyUrl, {
            headers: { 'Origin': 'https://tv.chocopopflow.com', 'User-Agent': 'Mozilla/5.0' },
            timeout: 20000,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        console.error(`❌ Todos los métodos de fetch fallaron: ${err.message}`);
        return null;
    }
}

// ─── Extrae var Streams del HTML ─────────────────────────────────────────────
function extractStreams(html) {
    // Patrón principal: var Streams = [...]
    const match = html.match(/var\s+Streams\s*=\s*(\[[\s\S]*?\]);/);
    if (match && match[1]) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`✅ Encontrados ${parsed.length} canales en var Streams`);
                return parsed;
            }
        } catch (e) {
            console.warn('⚠️  Error parseando Streams JSON:', e.message);
        }
    }

    // Patrón alternativo: Streams = [...]
    const match2 = html.match(/Streams\s*=\s*(\[[\s\S]*?\]);/);
    if (match2 && match2[1]) {
        try {
            const parsed = JSON.parse(match2[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`✅ Encontrados ${parsed.length} canales (patrón alternativo)`);
                return parsed;
            }
        } catch (e) {
            console.warn('⚠️  Error en patrón alternativo:', e.message);
        }
    }

    console.error('❌ No se encontró var Streams en el HTML');
    return null;
}

// ─── Extrae el token del relay de la primera URL encontrada ──────────────────
function extractToken(streams) {
    if (!streams || streams.length === 0) return null;
    const firstUrl = streams[0]?.url || '';
    // Formato: http://IP:PORT/Live/TOKEN/canal.playlist.m3u8
    const match = firstUrl.match(/\/Live\/([a-f0-9]{32})\//i);
    return match ? match[1] : null;
}

// ─── Limpia la colección en Firestore ────────────────────────────────────────
async function clearCollection() {
    const snapshot = await db.collection(COLLECTION).get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️  ${snapshot.size} canales antiguos eliminados`);
    }
}

// ─── Guarda metadata del token ────────────────────────────────────────────────
async function saveMetadata(token, channelCount) {
    await db.collection('chocopopMeta').doc('current').set({
        token,
        channelCount,
        relayBase: `http://201.217.246.42:44310/Live/${token}`,
        updatedAt: Date.now(),
        source: SOURCE_URL,
    });
    console.log(`💾 Metadata guardada → token: ${token}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de ChocoPop TV...');
    console.log(`📡 Fuente: ${SOURCE_URL}`);

    // 1. Descargar el HTML
    const html = await fetchChocopopHTML();
    if (!html) {
        console.error('\n❌ No se pudo obtener el HTML de ChocoPop TV. Abortando.');
        process.exit(1);
    }
    console.log(`📄 HTML descargado (${Math.round(html.length / 1024)} KB)`);

    // 2. Extraer la lista de canales
    const streams = extractStreams(html);
    if (!streams) {
        console.error('\n❌ No se encontraron canales. El sitio pudo haber cambiado su estructura.');
        process.exit(1);
    }

    // 3. Extraer el token actual
    const token = extractToken(streams);
    console.log(`🔑 Token detectado: ${token || '⚠️ No encontrado'}`);

    // 4. Procesar canales
    const processed = streams
        .filter(ch => ch.name && ch.url)
        .map((ch, index) => ({
            id: ch.m3u8 || `ch-${index}`,
            name: ch.name.trim(),
            m3u8: ch.m3u8 || `ch-${index}`,
            url: ch.url.trim(),
            poster: ch.poster || null,
            order: index,
            updatedAt: Date.now(),
        }));

    console.log(`\n📺 ${processed.length} canales listos para subir:`);
    processed.slice(0, 5).forEach(ch => {
        console.log(`   • ${ch.name} → ${ch.m3u8}`);
    });
    if (processed.length > 5) console.log(`   ... y ${processed.length - 5} más`);

    // 5. Limpiar colección anterior
    await clearCollection();

    // 6. Guardar en Firestore (en lotes de 400 para no superar el límite de batch)
    const BATCH_SIZE = 400;
    let saved = 0;
    for (let i = 0; i < processed.length; i += BATCH_SIZE) {
        const chunk = processed.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        chunk.forEach(ch => {
            batch.set(db.collection(COLLECTION).doc(ch.id), ch, { merge: false });
        });
        await batch.commit();
        saved += chunk.length;
        console.log(`💾 Guardando lote ${Math.ceil(i / BATCH_SIZE) + 1}... (${saved}/${processed.length})`);
    }

    // 7. Guardar metadata del token
    if (token) await saveMetadata(token, processed.length);

    console.log(`\n✅ ${processed.length} canales guardados en Firestore → colección "${COLLECTION}"`);
    console.log('🎉 Scraper de ChocoPop TV finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

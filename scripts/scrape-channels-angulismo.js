// ============================================================
//  scrape-channels-angulismo.js — Scraper de Canales con iframes
//  Fuente: json.angulismotv.workers.dev/channeIs
//  Actualiza la colección "channelFolders" en Firestore
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

// ─── Categorías a EXCLUIR ─────────────────────────────────────────────────────
// Excluir por nombre (case-insensitive) y también entradas con show: false
const EXCLUDED_NAMES = [
    'juegos',
    'los simpsons',
    'simpsons',
    'now events',
    'entretenimiento',  // películas/series de nowfutbol, no deportivos
    'rustico tv',
    'chat de twitch',
    'tests',
    'testsss',
    'tesssssss',
    'test espn',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isExcluded(name = '') {
    const lower = name.toLowerCase().trim();
    return EXCLUDED_NAMES.some(ex => lower === ex || lower.startsWith(ex));
}

function cleanIframeUrl(url = '') {
    if (!url || url === 'undefined' || url === 'null') return null;
    if (url.startsWith('chrome://') || url.startsWith('extension://')) return null;
    let clean = url.trim();
    if (clean.startsWith('//')) clean = 'https:' + clean;
    return clean;
}

// Genera un ID seguro desde el nombre del canal
function safeId(name = '') {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50);
}

// ─── Fetch con retry ──────────────────────────────────────────────────────────
async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VortexTV-Scraper/1.0)' },
                signal: AbortSignal.timeout(20000),
            });
            if (res.ok) return res;
            console.warn(`⚠️  HTTP ${res.status} (intento ${i + 1}/${retries})`);
        } catch (e) {
            console.warn(`⚠️  Error: ${e.message} (intento ${i + 1}/${retries})`);
        }
        if (i < retries - 1) await sleep(2000 * (i + 1));
    }
    return null;
}

// ─── Limpiar colección channelFolders (fuente angulismo) ─────────────────────
async function clearChannelFolders() {
    console.log('\n🗑️  Limpiando canales anteriores de angulismo...');
    const snapshot = await db.collection('channelFolders')
        .where('source', '==', 'angulismo')
        .get();

    if (!snapshot.empty) {
        // Borrar en batches de 500
        const batchSize = 500;
        let i = 0;
        while (i < snapshot.docs.length) {
            const batch = db.batch();
            snapshot.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            i += batchSize;
        }
        console.log(`   ✅ ${snapshot.size} documentos eliminados`);
    } else {
        console.log('   ℹ️  No había canales previos de esta fuente');
    }
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper de canales — VortexTV (AngulismoTV)');
    console.log(`📅 Fecha/Hora: ${new Date().toLocaleString('es-AR')}`);

    // 1. Descargar JSON de canales
    console.log('\n🌐 Descargando canales de json.angulismotv.workers.dev/channeIs...');
    const res = await fetchWithRetry('https://json.angulismotv.workers.dev/channeIs');

    if (!res) {
        console.error('❌ No se pudo obtener la lista de canales. Abortando.');
        process.exit(1);
    }

    const data = await res.json();
    const allChannels = data.channels || data; // soporte para ambos formatos
    console.log(`✅ ${allChannels.length} categorías encontradas en la fuente`);

    // 2. Filtrar canales excluidos y los con show: false
    const filtered = allChannels.filter(ch => {
        if (isExcluded(ch.name)) {
            console.log(`   ⛔ Excluido: "${ch.name}" (nombre excluido)`);
            return false;
        }
        if (ch.show === false) {
            console.log(`   ⛔ Excluido: "${ch.name}" (show: false)`);
            return false;
        }
        return true;
    });

    console.log(`\n📊 Canales después del filtrado: ${filtered.length}`);

    // 3. Limpiar Firestore
    await clearChannelFolders();

    // 4. Escribir en Firestore en batches
    let processed = 0;
    let skipped = 0;
    const BATCH_LIMIT = 490;
    let batch = db.batch();
    let batchCount = 0;

    for (const ch of filtered) {
        // Limpiar opciones (filtrar iframes inválidos)
        const cleanOptions = (ch.options || [])
            .map(opt => ({
                name: opt.name || '',
                iframe: cleanIframeUrl(opt.iframe),
            }))
            .filter(opt => opt.iframe !== null);

        if (cleanOptions.length === 0) {
            console.log(`   ⚠️  Saltado "${ch.name}" — sin iframes válidos`);
            skipped++;
            continue;
        }

        const id = safeId(ch.name);
        const docData = {
            id,
            name: ch.name,
            logo: ch.logo || '',
            options: cleanOptions,
            source: 'angulismo',
            updatedAt: Date.now(),
        };

        const ref = db.collection('channelFolders').doc(id);
        batch.set(ref, docData, { merge: false });
        batchCount++;
        processed++;

        console.log(`   ✅ "${ch.name}" → ${cleanOptions.length} opciones`);

        // Commit parcial si llegamos al límite
        if (batchCount >= BATCH_LIMIT) {
            await batch.commit();
            console.log(`\n💾 Batch de ${batchCount} guardado en Firestore`);
            batch = db.batch();
            batchCount = 0;
            await sleep(500);
        }
    }

    // Commit final
    if (batchCount > 0) {
        await batch.commit();
        console.log(`\n💾 Batch final de ${batchCount} guardado en Firestore`);
    }

    console.log(`\n✅ ${processed} canales escritos en Firestore → colección "channelFolders"`);
    if (skipped > 0) console.log(`⚠️  ${skipped} canales saltados (sin iframes válidos)`);
    console.log('🎉 Scraper de canales finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

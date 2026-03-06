// ============================================================
//  scrape-channels.js — Scraper Manual de Categórías (Carpetas)
//  Fuente: nowfutbol.pages.dev/vivo/channels.json
//  Sube a la colección "canales_carpetas" en Firestore
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
        console.log('🗝️  Usando credenciales de Firebase desde archivo local (service-account.json)');
    } else {
        console.error('\n❌ FIREBASE_SERVICE_ACCOUNT_JSON no está definida en el entorno y no se encontró el archivo local.');
        console.error('ℹ️  Asegúrate de configurar la variable de entorno localmente antes de ejecutar este script manual.\n');
        console.error('    Windows CMD: set FIREBASE_SERVICE_ACCOUNT_JSON={...}');
        console.error('    Windows PS:  $env:FIREBASE_SERVICE_ACCOUNT_JSON=\'{...}\'');
        console.error('    Linux/Mac:   export FIREBASE_SERVICE_ACCOUNT_JSON=\'{...}\'\n');
        process.exit(1);
    }
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(rawJson);
} catch (error) {
    console.error('❌ Error parseando FIREBASE_SERVICE_ACCOUNT_JSON (JSON inválido):', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Limpia la colección completa antes de insertar ──────────────────────────
async function clearCollection(collectionPath) {
    const snapshot = await db.collection(collectionPath).get();
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`🗑️  ${snapshot.size} carpetas antiguas eliminadas de '${collectionPath}'`);
    }
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Iniciando scraper MANUAL de carpetas de canales...');

    // 1. Descarga el JSON de nowfutbol
    console.log('\n🌐 Descargando channels.json...\n');
    const targetUrl = 'https://nowfutbol.pages.dev/vivo/channels.json';

    // Try via AllOrigins Proxy first, fallback to direct fetch if it fails
    let events = [];
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
        events = await res.json();
    } catch (err) {
        console.warn('⚠️  Fallo proxy AllOrigins, intentando peticion directa...', err.message);
        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`Error HTTP Directo: ${res.status}`);
        events = await res.json();
    }

    if (!Array.isArray(events) || events.length === 0) {
        console.log('⚠️  No se encontraron carpetas o el formato JSON es incorrecto.');
        return;
    }

    console.log(`✅ ${events.length} carpetas/categorías encontradas.`);

    // 2. Limpia los eventos viejos para evitar duplicados / canales muertos
    await clearCollection('canales_carpetas');

    // 3. Procesa y sube cada carpeta
    const batch = db.batch();
    let processedCards = 0;
    let totalChannels = 0;

    for (const [index, folder] of events.entries()) {
        const folderName = folder.name || `Carpeta ${index + 1}`;
        const logo = folder.logo || null;

        // Filtramos opciones que tengan links válidos
        const options = (folder.options || []).filter(opt =>
            opt && opt.name && opt.iframe && opt.iframe !== 'undefined'
        ).map(opt => {
            let cleanIframe = opt.iframe.trim();
            if (cleanIframe.startsWith('//')) cleanIframe = 'https:' + cleanIframe;
            else if (!cleanIframe.startsWith('http')) cleanIframe = 'https://' + cleanIframe;

            return {
                name: opt.name.trim(),
                iframe: cleanIframe
            };
        });

        if (options.length === 0) {
            console.log(`   ⏭️  Saltando carpeta "${folderName}" (sin canales válidos).`);
            continue;
        }

        console.log(`📂 ${folderName}`);
        console.log(`   📺 ${options.length} canales extraídos`);

        // Creamos un ID único y legible para la carpeta
        const docId = folderName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `folder-${index}`;

        const docData = {
            id: docId,
            name: folderName,
            logo: logo,
            options: options,  // { name: "ESPN", iframe: "https..." }
            order: index,      // Para mantener el orden original del JSON si se desea ordenar
            updatedAt: Date.now(),
        };

        const ref = db.collection('canales_carpetas').doc(docId);
        batch.set(ref, docData, { merge: false });

        processedCards++;
        totalChannels += options.length;
    }

    // 4. Escribe en Firestore
    await batch.commit();
    console.log(`\n✅ ${processedCards} carpetas guardadas en Firestore → colección "canales_carpetas"`);
    console.log(`✅ ${totalChannels} canales en total insertados.`);
    console.log('🎉 Scraper manual finalizado correctamente\n');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

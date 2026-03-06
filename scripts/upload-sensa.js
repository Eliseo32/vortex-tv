// ============================================================
//  upload-sensa.js — Parsea sensa.json (M3U) y sube canales
//  a la colección "content" de Firestore con type: 'tv'
//  Autor: VortexTV
// ============================================================

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
    console.error('❌ Error leyendo las credenciales de Firebase.', error.message);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Mapeo de grupos M3U → géneros de la app ─────────────────────────────────
const GROUP_TO_GENRE = {
    'nacionales': 'Nacional',
    'nacionales (canales de aire)': 'Nacional',
    'noticias': 'Noticias',
    'deportes': 'Deportes',
    'pack fútbol': 'Deportes',
    '⚽ deportivos': 'Deportes',
    'cine, series y novelas': 'Peliculas',
    'hbo pack': 'Peliculas',
    'universal+ pack': 'Peliculas',
    'infantiles': 'Infantil',
    'infantiles y familiares': 'Infantil',
    'música': 'Musica',
    'música y radios': 'Musica',
    'internacionales': 'Internacional',
    'mundo': 'Internacional',
    'culturales y documentales': 'Entretenimiento',
    'culturales': 'Entretenimiento',
    'estilos de vida y variedades': 'Entretenimiento',
    'estilos de vida': 'Entretenimiento',
    'variedades': 'Entretenimiento',
    'regionales': 'Regional',
    'córdoba': 'Regional',
    'religión': 'Entretenimiento',
    'agro': 'Entretenimiento',
};

function mapGroup(groupTitle) {
    if (!groupTitle) return 'Entretenimiento';
    const lower = groupTitle.toLowerCase().trim();
    return GROUP_TO_GENRE[lower] || 'Entretenimiento';
}

// ─── Parsea el archivo M3U ────────────────────────────────────────────────────
function parseM3U(content) {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const channels = [];
    let currentGroup = '';

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        // Detectar grupo global (#EXTGRP)
        if (line.startsWith('#EXTGRP:')) {
            currentGroup = line.replace('#EXTGRP:', '').trim();
            i++;
            continue;
        }

        // Detectar canal (#EXTINF)
        if (line.startsWith('#EXTINF:')) {
            const channel = { name: '', logo: '', group: currentGroup, url: '', keyId: '', key: '', userAgent: '' };

            // Extraer nombre (último campo después de la última coma)
            const lastComma = line.lastIndexOf(',');
            if (lastComma > -1) {
                channel.name = line.slice(lastComma + 1).trim();
            }

            // Extraer logo
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);
            if (logoMatch) channel.logo = logoMatch[1];

            // Extraer group-title (override del EXTGRP)
            const groupMatch = line.match(/group-title="([^"]*)"/);
            if (groupMatch) channel.group = groupMatch[1];

            // También chequear tvg-group
            const tvgGroupMatch = line.match(/tvg-group="([^"]*)"/);
            if (tvgGroupMatch && !groupMatch) channel.group = tvgGroupMatch[1];

            // Leer las líneas siguientes hasta encontrar la URL
            i++;
            while (i < lines.length && !lines[i].startsWith('http')) {
                const nextLine = lines[i];

                // Extraer DRM key
                if (nextLine.includes('license_key=')) {
                    const keyPart = nextLine.split('license_key=')[1];
                    if (keyPart && keyPart.includes(':')) {
                        const [keyId, key] = keyPart.split(':');
                        channel.keyId = keyId.trim();
                        channel.key = key.trim();
                    }
                }

                // Extraer User-Agent
                if (nextLine.includes('http-user-agent=')) {
                    channel.userAgent = nextLine.split('http-user-agent=')[1].trim();
                }

                i++;
            }

            // La línea actual debería ser la URL
            if (i < lines.length && lines[i].startsWith('http')) {
                channel.url = lines[i].trim();
                i++;
            }

            if (channel.name && channel.url) {
                channels.push(channel);
            }
            continue;
        }

        i++;
    }

    return channels;
}

// ─── Construye videoUrl con parámetros DRM embebidos ──────────────────────────
function buildVideoUrl(channel) {
    // Separar la URL base del parámetro Kodi (?|referer=...)
    let baseUrl = channel.url;
    let referer = '';

    const pipeIdx = baseUrl.indexOf('?|');
    if (pipeIdx > -1) {
        // Extraer referer del formato Kodi: ?|referer=URL&webtoken=1.0
        const pipeParams = baseUrl.slice(pipeIdx + 2);
        const refMatch = pipeParams.match(/referer=([^&]*)/i);
        if (refMatch) referer = decodeURIComponent(refMatch[1]);
        baseUrl = baseUrl.slice(0, pipeIdx);
    }

    // Agregar parámetros DRM y referer como query params normales
    const params = new URLSearchParams();
    if (channel.keyId) params.set('drmKeyId', channel.keyId);
    if (channel.key) params.set('drmKey', channel.key);
    if (referer) params.set('drmReferer', referer);

    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${params.toString()}`;
}

// ─── Genera ID seguro para Firestore ──────────────────────────────────────────
function generateId(name) {
    return 'sensa-' + name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quitar acentos
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
}

// ─── Borrar canales Sensa existentes ──────────────────────────────────────────
async function cleanSensaChannels() {
    console.log('🗑️  Borrando canales Sensa existentes de Firestore...');
    const snapshot = await db.collection('content').get();
    let deleted = 0;
    const BATCH_SIZE = 450;
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        if (doc.id.startsWith('sensa-')) {
            batch.delete(doc.ref);
            count++;
            deleted++;
            if (count >= BATCH_SIZE) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
    console.log(`   ✅ ${deleted} canales Sensa eliminados\n`);
}

// ─── Función principal ────────────────────────────────────────────────────────
async function main() {
    const isClean = process.argv.includes('--clean');
    const isDeleteOnly = process.argv.includes('--delete-only');

    if (isDeleteOnly) {
        console.log('🗑️  Modo delete-only: borrando canales Sensa...\n');
        await cleanSensaChannels();
        console.log('✅ Canales Sensa eliminados. No se subió nada nuevo.');
        return;
    }

    console.log('🚀 Iniciando upload de canales Sensa...\n');

    // 0. Si se pasa --clean, borrar canales Sensa existentes primero
    if (isClean) {
        await cleanSensaChannels();
    }

    // 1. Leer y parsear el archivo M3U
    const m3uPath = join(__dirname, '..', 'm3u', 'sensa (2).m3u8');
    const m3uContent = readFileSync(m3uPath, 'utf-8');
    const channels = parseM3U(m3uContent);

    console.log(`📺 ${channels.length} canales parseados del archivo M3U\n`);

    // 2. Agrupar por género para mostrar resumen
    const genreCount = {};
    channels.forEach(ch => {
        const genre = mapGroup(ch.group);
        genreCount[genre] = (genreCount[genre] || 0) + 1;
    });
    console.log('📊 Distribución por género:');
    Object.entries(genreCount).sort((a, b) => b[1] - a[1]).forEach(([genre, count]) => {
        console.log(`   ${genre}: ${count} canales`);
    });

    // 3. Subir a Firestore
    console.log('\n🔥 Subiendo a Firestore (colección "content")...\n');

    // Usar batches de 500 (límite de Firestore)
    const BATCH_SIZE = 450;
    let totalUploaded = 0;
    let batch = db.batch();
    let batchCount = 0;

    for (const ch of channels) {
        const id = generateId(ch.name);
        const genre = mapGroup(ch.group);
        const videoUrl = buildVideoUrl(ch);

        const docData = {
            id,
            type: 'tv',
            title: ch.name,
            genre,
            poster: ch.logo || '',
            backdrop: '',
            description: `${ch.name} en vivo`,
            rating: '',
            year: '',
            videoUrl,
        };

        const ref = db.collection('content').doc(id);
        batch.set(ref, docData, { merge: true });
        batchCount++;

        console.log(`   ✅ ${ch.name} → ${genre} (${id})`);

        // Commit batch si llegamos al límite
        if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`   💾 Batch de ${batchCount} documentos escritos`);
            totalUploaded += batchCount;
            batch = db.batch();
            batchCount = 0;
        }
    }

    // Commit del último batch
    if (batchCount > 0) {
        await batch.commit();
        totalUploaded += batchCount;
        console.log(`   💾 Batch final de ${batchCount} documentos escritos`);
    }

    console.log(`\n🎉 ¡Listo! ${totalUploaded} canales subidos a Firestore`);
    console.log('   Colección: "content" | type: "tv"');
}

main().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});

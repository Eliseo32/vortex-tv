import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const __dirname = import.meta.dirname;

// Si quieres subirlo a Firebase, inicializa la app. 
// Para solo generar el JSON, puedes comentar esta parte.
try {
    const serviceAccountPath = path.join(__dirname, 'service-account.json');
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }
} catch (e) {
    console.log("No se pudo cargar service-account.json. Solo se generará archivo local.", e.message);
}

const db = admin.apps.length ? admin.firestore() : null;

// Rutas de entrada y salida
const INPUT_FILE = path.join(__dirname, '../m3u/sensa (2).m3u8');
const OUTPUT_FILE = path.join(__dirname, '../m3u/sensa_parsed.json');

async function parseM3u8() {
    console.log(`📖 Leyendo archivo: ${INPUT_FILE}`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error("❌ Archivo no encontrado.");
        return;
    }

    const content = fs.readFileSync(INPUT_FILE, 'utf-8');
    const lines = content.split(/\r?\n/);

    const channels = [];
    let currentChannel = {};

    for (const line of lines) {
        const tLine = line.trim();
        if (!tLine) continue;

        if (tLine.startsWith('#EXTINF:')) {
            // Guardar el anterior si existía y tenía URL
            if (currentChannel.name && currentChannel.url) {
                channels.push(currentChannel);
            }
            // Iniciar uno nuevo
            currentChannel = {
                name: '',
                logo: '',
                group: '',
                url: '',
                drmKeyId: '',
                drmKey: '',
                userAgent: '',
                referer: ''
            };

            // Parsear #EXTINF:-1 tvg-id="..." tvg-logo="..." group-title="..." , Nombre
            const logoMatch = tLine.match(/tvg-logo="([^"]+)"/);
            const groupMatch = tLine.match(/(?:group-title|tvg-group)="([^"]+)"/);
            const nameMatch = tLine.match(/,\s*(.+)$/);

            if (logoMatch) currentChannel.logo = logoMatch[1];
            if (groupMatch) currentChannel.group = groupMatch[1];
            if (nameMatch) currentChannel.name = nameMatch[1].trim();

        } else if (tLine.startsWith('#KODIPROP:inputstream.adaptive.license_key=')) {
            const keyStr = tLine.split('=')[1];
            if (keyStr) {
                // Formato suele ser: KEY_ID:KEY
                const parts = keyStr.split(':');
                if (parts.length >= 2) {
                    currentChannel.drmKeyId = parts[0];
                    currentChannel.drmKey = parts[1];
                } else if (keyStr.startsWith('http')) {
                    // Es una URL de licencia (Widevine)
                    currentChannel.drmLicenseUrl = keyStr;
                }
            }
        } else if (tLine.startsWith('#EXTVLCOPT:http-user-agent=')) {
            currentChannel.userAgent = tLine.split('=')[1];
        } else if (!tLine.startsWith('#')) {
            // Esta debe ser la URL del stream
            let url = tLine;
            // Algunas URLs de kodi tienen el referer pegado con "|" ej: http...mpd?|referer=http...
            if (url.includes('|referer=')) {
                const parts = url.split('|referer=');
                currentChannel.url = parts[0];

                let ref = parts[1];
                if (ref.includes('&')) ref = ref.split('&')[0]; // Limpiar extra tokens
                currentChannel.referer = ref;
            } else {
                currentChannel.url = url;
            }

            // Si la URL termina acá, pushear el canal inmediatamente para no perderlo
            channels.push({ ...currentChannel });
            currentChannel = {}; // Resetear
        }
    }

    // Agrupar canales por categoría (group)
    const grouped = {};
    channels.forEach(ch => {
        const groupName = ch.group || 'Sensa TV';
        if (!grouped[groupName]) grouped[groupName] = [];

        // Construir URL con parámetros DRM de una vez
        let finalIframe = ch.url;
        if (ch.drmKeyId && ch.drmKey) {
            const separator = finalIframe.includes('?') ? '&' : '?';
            finalIframe += `${separator}drmKeyId=${ch.drmKeyId}&drmKey=${ch.drmKey}`;
        }
        if (ch.referer) {
            const separator = finalIframe.includes('?') ? '&' : '?';
            finalIframe += `${separator}drmReferer=${encodeURIComponent(ch.referer)}`;
        }

        grouped[groupName].push({
            name: ch.name,
            iframe: finalIframe,
            logo: ch.logo
        });
    });

    console.log(`✅ ${channels.length} canales extraídos y agrupados en ${Object.keys(grouped).length} categorías.`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(grouped, null, 2));

    // Subir a Firebase si está configurado
    if (db) {
        console.log(`🚀 Subiendo a Firestore (colección canales_carpetas)...`);
        const batch = db.batch();
        let i = 0;

        for (const [groupName, options] of Object.entries(grouped)) {
            const docId = `sensa-${groupName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
            const docData = {
                id: docId,
                name: `Sensa ${groupName}`,
                logo: '',
                options: options.map(opt => ({ name: opt.name, iframe: opt.iframe })),
                order: 100 + i, // Mostrar después de los de nowfutbol
                updatedAt: Date.now()
            };

            const ref = db.collection('canales_carpetas').doc(docId);
            batch.set(ref, docData, { merge: false });
            i++;
        }

        await batch.commit();
        console.log(`✅ Categorías de Sensa subidas a Firestore exitosamente.`);
    }

    return grouped;
}

parseM3u8().catch(console.error);

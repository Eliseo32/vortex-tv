// clear-agenda.js — Borra TODOS los documentos de la colección "agenda"
// Usalo UNA vez para limpiar datos viejos del scraper anterior.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawJson) {
    console.error('❌ Falta FIREBASE_SERVICE_ACCOUNT_JSON en el entorno.');
    process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(rawJson)) });
const db = getFirestore();

async function clearAll() {
    console.log('🗑️  Borrando colección "agenda"...');
    const snapshot = await db.collection('agenda').get();
    if (snapshot.empty) {
        console.log('✅ La colección ya estaba vacía.');
        return;
    }
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`✅ ${snapshot.size} documentos eliminados.`);
}

clearAll().catch(err => { console.error('❌', err); process.exit(1); });

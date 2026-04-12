#!/usr/bin/env node
/**
 * search-db.js — Buscar títulos en Firebase
 * Uso: node scripts/search-db.js "avatar"
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawJson) {
  try { rawJson = readFileSync(join(__dirname, 'service-account.json'), 'utf-8'); }
  catch { console.error('❌ No se encontró FIREBASE_SERVICE_ACCOUNT_JSON ni scripts/service-account.json'); process.exit(1); }
}

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(rawJson)) });
}
const db = getFirestore();

const term = process.argv[2] || 'avatar';

console.log(`\n🔍 Buscando "${term}" en la colección 'content'...\n`);

const snapshot = await db.collection('content').get();
const results = [];

snapshot.forEach(doc => {
  const data = doc.data();
  if (data.title && data.title.toLowerCase().includes(term.toLowerCase())) {
    results.push({
      id: doc.id,
      title: data.title,
      type: data.type,
      year: data.year || '?',
      source: data.source || '?',
      hasServers: !!(data.servers && data.servers.length > 0),
      hasVideoUrl: !!data.videoUrl,
      hasSeasons: !!(data.seasonsData && data.seasonsData.length > 0),
      seasonCount: data.seasonsData?.length || 0,
    });
  }
});

if (results.length === 0) {
  console.log(`❌ No se encontró nada con "${term}"`);
} else {
  console.log(`✅ ${results.length} resultado(s):\n`);
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. "${r.title}" (${r.year})`);
    console.log(`     ID: ${r.id} | Tipo: ${r.type} | Fuente: ${r.source}`);
    console.log(`     Servers: ${r.hasServers ? 'SÍ' : 'NO'} | VideoURL: ${r.hasVideoUrl ? 'SÍ' : 'NO'} | Temporadas: ${r.seasonCount}`);
    console.log('');
  });
}

console.log(`📊 Total docs en 'content': ${snapshot.size}`);
process.exit(0);

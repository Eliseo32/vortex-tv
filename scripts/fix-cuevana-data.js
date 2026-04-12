#!/usr/bin/env node
/**
 * fix-cuevana-data.js
 * Limpia todo el contenido de Cuevana en Firebase y lo re-sube correctamente.
 * Uso: node scripts/fix-cuevana-data.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', purple: '\x1b[35m',
};
const red    = s => `${c.red}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;
const bold   = s => `${c.bold}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;

// ── Firebase Init ────────────────────────────────────────────────────────────
let serviceAccount;
const saPath = join(__dirname, 'service-account.json');
try {
  serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
} catch {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!env) { console.error(red('❌ No se encontró service-account.json')); process.exit(1); }
  serviceAccount = JSON.parse(env);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BASE_URL  = 'https://cuevana.gs';
const API       = `${BASE_URL}/wp-api/v1`;
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACK = 'https://image.tmdb.org/t/p/w1280';
const PPP       = 24;

const sleep = ms => new Promise(r => setTimeout(r, ms));

const GENRE_MAP = {
  12:'Aventura',14:'Fantasía',16:'Animación',18:'Drama',27:'Terror',
  28:'Acción',35:'Comedia',36:'Historia',37:'Western',53:'Drama',
  54:'Romance',80:'Crimen',81:'Comedia',99:'Documental',190:'Thriller',
  345:'Misterio',878:'Ciencia Ficción',10749:'Romance',10751:'Familia',
  10752:'Bélica',252:'Aventura',253:'Fantasía',
};

function mapGenres(ids) {
  if (!ids?.length) return 'Varios';
  const names = ids.map(id => GENRE_MAP[id]).filter(Boolean);
  return names[0] || 'Varios';
}

// ── Siempre TMDB para posters (sin hotlink protection) ─────────────────────
function buildPoster(post) {
  if (post.poster   && post.poster.startsWith('/'))   return `${TMDB_IMG}${post.poster}`;
  if (post.poster   && post.poster.startsWith('http')) return post.poster;
  return '';
}
function buildBackdrop(post) {
  if (post.backdrop && post.backdrop.startsWith('/'))   return `${TMDB_BACK}${post.backdrop}`;
  if (post.backdrop && post.backdrop.startsWith('http')) return post.backdrop;
  return '';
}

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': BASE_URL },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch(e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

async function fetchListing(type, page) {
  const data = await fetchJSON(`${API}/listing/${type}?page=${page}&orderBy=false&order=desc&postType=${type}&postsPerPage=${PPP}`);
  return data?.data || { posts: [], pagination: {} };
}

function transformPost(post, defaultType) {
  // Mapear tipo de Cuevana a tipo de la app
  const TYPE_MAP = { movies: 'movie', tvshows: 'series', animes: 'anime' };
  const type = TYPE_MAP[post.type] || TYPE_MAP[defaultType] || 'movie';
  
  return {
    id: `cuevana-${post._id}`,
    tmdb_id: post._id?.toString(),
    slug: post.slug || '',
    type,
    title: post.title || 'Sin título',
    year: post.release_date?.split('-')[0] || '',
    genre: mapGenres(post.genres),
    // SIEMPRE TMDB — nunca Cuevana CDN (tiene hotlink protection)
    poster:   buildPoster(post),
    backdrop: buildBackdrop(post),
    description: post.overview || '',
    rating: post.rating?.toString() || '',
    source: 'cuevana',
    ...(type === 'movie'
      ? { videoUrl: '', servers: [] }
      : { seasonsData: [], episodeLinks: {} }),
    updatedAt: Date.now(),
  };
}

// ── Borrar contenido de Cuevana en Firebase ──────────────────────────────────
async function deleteAllCuevana() {
  process.stdout.write(cyan('\n  🗑️  Borrando contenido de Cuevana en Firebase...'));
  let total = 0;
  let snap;
  do {
    try {
      // Lote chico (50) + delay para no superar el rate limit de Firestore
      snap = await db.collection('content').where('source', '==', 'cuevana').limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.docs.length;
      process.stdout.write(`\r  🗑️  Borrados: ${yellow(total)}...   `);
      await sleep(2000); // 2s entre lotes → ~25 writes/seg, bien bajo el límite
    } catch(e) {
      if (e.code === 8 || String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(`\n  ${yellow('⚠️  Quota temporaria — esperando 60s...')}`);
        await sleep(60000);
      } else {
        throw e;
      }
    }
  } while (!snap?.empty);
  console.log(`\n  ${green('✅')} ${total} documentos eliminados.\n`);
}

// ── Upload en lotes ──────────────────────────────────────────────────────────
async function uploadBatch(items) {
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = db.batch();
    items.slice(i, i + CHUNK).forEach(item => {
      batch.set(db.collection('content').doc(item.id), item, { merge: true });
    });
    await batch.commit();
  }
}

// ── Obtener IDs existentes ────────────────────────────────────────────────────
async function getExistingIds() {
  const ids = new Set();
  let lastDoc = null;
  while (true) {
    let q = db.collection('content').select().limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => ids.add(d.id));
    lastDoc = snap.docs[snap.docs.length - 1];
  }
  return ids;
}

// ── Scrape de un tipo completo ────────────────────────────────────────────────
async function scrapeType(apiType, label, skipExisting = false) {
  console.log(`\n  ${bold(`📥 Scrapeando ${label}...`)}`);
  
  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    existingIds = await getExistingIds();
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  const firstPage = await fetchListing(apiType, 1);
  const totalPages = firstPage.pagination?.last_page || 1;
  const totalItems = totalPages * PPP;
  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('~Items:')} ${totalItems}`);

  let uploaded = 0, skipped = 0, errors = 0;
  const startTime = Date.now();
  const buffer = [];

  for (let page = 1; page <= totalPages; page++) {
    let posts;
    try {
      const data = await fetchListing(apiType, page);
      posts = data.posts;
    } catch {
      errors++;
      await sleep(3000);
      continue;
    }
    if (!posts?.length) break;

    for (const post of posts) {
      try {
        const item = transformPost(post, apiType);
        if (skipExisting && existingIds.has(item.id)) {
          skipped++;
          continue;
        }
        buffer.push(item);
        uploaded++;
        if (buffer.length >= 200) await uploadBatch(buffer.splice(0));
      } catch { errors++; }
    }

    // Barra de progreso
    const pct = (page / totalPages * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = page / elapsed;
    const remaining = Math.ceil((totalPages - page) / rate);
    const min = Math.floor(remaining / 60), sec = remaining % 60;
    process.stdout.write(`\r  ${cyan(pct + '%')} ${dim(`pág ${page}/${totalPages}`)} Sub: ${green(uploaded)} Skip: ${dim(skipped)} Err: ${errors ? red(errors) : dim(0)} ETA: ${yellow(`${min}m ${sec}s`)}   `);

    await sleep(150);
  }

  if (buffer.length) await uploadBatch(buffer);
  console.log(`\n  ${green('✅')} ${label}: ${green(uploaded)} items sub, ${dim(skipped)} skip, ${errors > 0 ? red(errors + ' errores') : green('sin errores')}\n`);
  return { uploaded, errors };
}

// ── Menú ─────────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.clear();
  console.log(`\n${c.purple}${c.bold}  ╔══════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  🔧  FIX CUEVANA DATA  →  FIREBASE           ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╚══════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`  ${yellow('⚠️  Este script:')} `);
  console.log(`     1. Borra TODO el contenido de Cuevana en Firebase`);
  console.log(`     2. Lo re-sube correctamente (TMDB posters, tipos correctos)`);
  console.log(`     3. ${dim('Los animes/series van a su sección correcta')}`);
  console.log(`     4. ${dim('Los posters van a cargar (imagen TMDB, sin hotlink)')}\n`);

  console.log(`  ${bold('Opciones:')}`);
  console.log(`  [1] 🎯  Borrar y re-scrapear TODO (películas + series + animes) ~1-2hs`);
  console.log(`  [2] 🎬  Borrar y re-scrapear solo Películas`);
  console.log(`  [3] 📺  Borrar y re-scrapear solo Series`);
  console.log(`  [4] 🅰️   Borrar y re-scrapear solo Animes`);
  console.log(`  [5] 🗑️   Solo borrar (sin re-scrapear)`);
  console.log(`  [6] 🔄  Solo scrapear TODO (sin borrar, saltando ítems existentes)`);
  console.log(`  [7] ❌  Salir\n`);

  const choice = (await ask(`  Opción → `)).trim();
  
  if (choice === '7') { rl.close(); return; }
  if (choice === '5') { await deleteAllCuevana(); rl.close(); return; }

  // Opción 6: solo agregar sin borrar
  if (choice === '6') {
    console.log(`\n  ${cyan('🔄 Scrapeando y subiendo. Se saltearán ítems que ya existen...')}`);
    const totals = { uploaded: 0, errors: 0 };
    const add = r => { totals.uploaded += r.uploaded; totals.errors += r.errors; };
    add(await scrapeType('movies', 'Películas', true));
    add(await scrapeType('tvshows', 'Series', true));
    add(await scrapeType('animes', 'Animes', true));
    console.log(`\n  ${green('🎉 ¡Finalizado!')} Total subidos: ${green(totals.uploaded)} | Errores: ${totals.errors > 0 ? red(totals.errors) : green(0)}\n`);
    rl.close(); return;
  }

  const confirm = (await ask(`\n  ${yellow('⚠️  ¿Confirmás que querés borrar y re-scraper?')} (s/n) → `)).toLowerCase();
  if (confirm !== 's') { console.log(yellow('\n  Cancelado.\n')); rl.close(); return; }

  await deleteAllCuevana();

  const totals = { uploaded: 0, errors: 0 };
  const add = r => { totals.uploaded += r.uploaded; totals.errors += r.errors; };

  if (choice === '1') {
    add(await scrapeType('movies', 'Películas'));
    add(await scrapeType('tvshows', 'Series'));
    add(await scrapeType('animes', 'Animes'));
  } else if (choice === '2') {
    add(await scrapeType('movies', 'Películas'));
  } else if (choice === '3') {
    add(await scrapeType('tvshows', 'Series'));
  } else if (choice === '4') {
    add(await scrapeType('animes', 'Animes'));
  }

  console.log(`\n  ${green('🎉 ¡Finalizado!')} Total subidos: ${green(totals.uploaded)} | Errores: ${totals.errors > 0 ? red(totals.errors) : green(0)}\n`);
  rl.close();
}

main().catch(e => { console.error(red('\n❌ Error:'), e.message); process.exit(1); });

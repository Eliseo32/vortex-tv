#!/usr/bin/env node
/**
 * scrape-cuevana-bi.js
 * 
 * Réplica en Node.js del scraper_cuevana.py:
 *  1. Obtiene catálogo de cuevana.gs API (miles de títulos)
 *  2. Para cada título, busca en cuevana.bi los servers (data-server)
 *  3. El primer server con token va como URL principal (sin anuncios)
 *  4. doc_id = movie_{tmdb_id} / series_{tmdb_id} (compatible con Python scraper)
 * 
 * Correr con: node scripts/scrape-cuevana-bi.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Colores ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  purple: '\x1b[35m', cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m',
};
const bold   = s => `${c.bold}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const red    = s => `${c.red}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;

// ── Firebase ─────────────────────────────────────────────────────────────────
let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawJson) {
  try { rawJson = readFileSync(join(__dirname, 'service-account.json'), 'utf-8'); }
  catch { console.error(red('❌ No se encontró scripts/service-account.json')); process.exit(1); }
}
initializeApp({ credential: cert(JSON.parse(rawJson)) });
const db = getFirestore();

// ── Constantes ───────────────────────────────────────────────────────────────
const GS_BASE  = 'https://cuevana.gs';
const GS_API   = `${GS_BASE}/wp-api/v1`;
const BI_BASE  = 'https://cuevana.bi';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACK= 'https://image.tmdb.org/t/p/w1280';
const PPP      = 24;
const sleep    = ms => new Promise(r => setTimeout(r, ms));

const BI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'Referer': BI_BASE + '/',
};

const GENRE_MAP = {
  12:'Aventura',14:'Fantasía',16:'Animación',18:'Drama',27:'Terror',
  28:'Acción',35:'Comedia',36:'Historia',37:'Western',53:'Drama',
  54:'Romance',80:'Crimen',81:'Comedia',99:'Documental',190:'Thriller',
  345:'Misterio',878:'Ciencia Ficción',10749:'Romance',10751:'Familia',
  10752:'Bélica',252:'Aventura',253:'Fantasía',
};
function mapGenres(ids) {
  if (!ids?.length) return 'Varios';
  return ids.map(id => GENRE_MAP[id]).filter(Boolean)[0] || 'Varios';
}

// ── Fetch JSON (cuevana.gs API) ──────────────────────────────────────────────
async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': GS_BASE },
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
  const data = await fetchJSON(`${GS_API}/listing/${type}?page=${page}&orderBy=false&order=desc&postType=${type}&postsPerPage=${PPP}`);
  return data?.data || { posts: [], pagination: {} };
}

// ── atrapar_servidores — IGUAL que el Python scraper ─────────────────────────
// Hace GET a cuevana.bi/pelicula/{slug}, extrae li[data-server],
// decodifica base64 si ?v=, filtra youtube
async function atraparServidores(urlPlayer) {
  try {
    const res = await fetch(urlPlayer, {
      headers: BI_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    
    // Regex para encontrar todos los li con data-server
    const serverRegex = /data-server=["']([^"']+)["']/g;
    // También buscar el nombre del servidor (span dentro del li)
    const fullRegex = /<li[^>]*data-server=["']([^"']+)["'][^>]*>[\s\S]*?<span[^>]*>(.*?)<\/span>/gi;
    
    const enlaces = [];
    let match;
    
    // Primero intentar con nombre
    while ((match = fullRegex.exec(html)) !== null) {
      let dataServer = match[1];
      const serverName = match[2]?.trim() || 'Cuevana Server';
      
      // Decodificar base64 si tiene ?v= (igual que el Python)
      if (dataServer.includes('?v=')) {
        const encoded = dataServer.split('?v=')[1];
        try {
          dataServer = Buffer.from(encoded, 'base64').toString('utf-8');
        } catch {}
      }
      
      // Filtro: no incluir youtube
      if (dataServer.toLowerCase().includes('youtube')) continue;
      
      enlaces.push({ name: serverName, url: dataServer });
    }
    
    // Si no encontró con el regex complejo, intentar solo data-server
    if (!enlaces.length) {
      while ((match = serverRegex.exec(html)) !== null) {
        let dataServer = match[1];
        
        if (dataServer.includes('?v=')) {
          const encoded = dataServer.split('?v=')[1];
          try {
            dataServer = Buffer.from(encoded, 'base64').toString('utf-8');
          } catch {}
        }
        
        if (dataServer.toLowerCase().includes('youtube')) continue;
        
        // Si NO empieza con http, es un token → construir URL del player
        if (!dataServer.startsWith('http')) {
          dataServer = `https://player.cuevana.bi/?token=${dataServer}`;
        }
        
        enlaces.push({ name: `Servidor ${enlaces.length + 1}`, url: dataServer });
      }
    }
    
    return enlaces;
  } catch {
    return [];
  }
}

// ── Build poster/backdrop ────────────────────────────────────────────────────
function buildPoster(post) {
  if (post.poster?.startsWith('/'))    return `${TMDB_IMG}${post.poster}`;
  if (post.poster?.startsWith('http')) return post.poster;
  return '';
}
function buildBackdrop(post) {
  if (post.backdrop?.startsWith('/'))    return `${TMDB_BACK}${post.backdrop}`;
  if (post.backdrop?.startsWith('http')) return post.backdrop;
  return '';
}

// ── Transformar post → Firebase (doc_id = movie_{tmdb_id} / series_{tmdb_id}) ─
function transformPost(post, defaultType, servers) {
  const TYPE_MAP = { movies: 'movie', tvshows: 'series', animes: 'anime' };
  const type = TYPE_MAP[post.type] || TYPE_MAP[defaultType] || 'movie';
  
  // doc_id compatible con Python scraper: movie_{tmdb_id} / series_{tmdb_id}
  const docId = `${type}_${post._id}`;

  return {
    id: docId,
    tmdb_id: post._id?.toString(),
    slug: post.slug || '',
    type,
    title: post.title || 'Sin título',
    year: post.release_date?.split('-')[0] || '',
    genre: mapGenres(post.genres),
    poster: buildPoster(post),
    backdrop: buildBackdrop(post),
    description: post.overview || '',
    rating: post.rating?.toString() || '',
    source: 'cuevana-bi',
    servers: servers || [],
    videoUrl: servers?.[0]?.url || '',
    ...(type !== 'movie' ? {
      seasonsData: [],
      episodeLinks: {},
    } : {}),
    updatedAt: Date.now(),
  };
}

// ── Obtener IDs existentes ───────────────────────────────────────────────────
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

// ── Upload en lotes ──────────────────────────────────────────────────────────
async function uploadBatch(items) {
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = db.batch();
    items.slice(i, i + CHUNK).forEach(item => {
      batch.set(db.collection('content').doc(item.id), item, { merge: true });
    });
    try {
      await batch.commit();
    } catch(e) {
      if (String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(yellow('\n  ⚠️  Quota — esperando 60s...'));
        await sleep(60000);
        const batch2 = db.batch();
        items.slice(i, i + CHUNK).forEach(item => {
          batch2.set(db.collection('content').doc(item.id), item, { merge: true });
        });
        await batch2.commit();
      } else throw e;
    }
  }
}

// ── Scrape de un tipo ────────────────────────────────────────────────────────
async function scrapeType(apiType, label, skipExisting = false, fetchTokens = true) {
  console.log(`\n  ${bold(`📥 Scrapeando ${label}...`)}`);

  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    existingIds = await getExistingIds();
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  const firstPage = await fetchListing(apiType, 1);
  const totalPages = firstPage.pagination?.last_page || 1;
  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('~Items:')} ${totalPages * PPP}`);
  if (fetchTokens) {
    console.log(`  ${cyan('🔑 Buscando servidores en cuevana.bi (primer token = sin anuncios)...')}`);
  }

  let uploaded = 0, skipped = 0, errors = 0, serversFound = 0;
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
      const TYPE_MAP = { movies: 'movie', tvshows: 'series', animes: 'anime' };
      const type = TYPE_MAP[post.type] || TYPE_MAP[apiType] || 'movie';
      const docId = `${type}_${post._id}`;
      
      if (skipExisting && existingIds.has(docId)) { skipped++; continue; }
      
      try {
        let servers = [];
        
        if (fetchTokens && post.slug) {
          // Buscar servidores en cuevana.bi — igual que atrapar_servidores en Python
          const prefix = apiType === 'movies' ? 'pelicula' : 'serie';
          const biUrl = `${BI_BASE}/${prefix}/${post.slug}`;
          servers = await atraparServidores(biUrl);
          if (servers.length) serversFound++;
          await sleep(300); // Rate limit
        }
        
        buffer.push(transformPost(post, apiType, servers));
        uploaded++;
        if (buffer.length >= 100) await uploadBatch(buffer.splice(0));
      } catch { errors++; }
    }

    const pct = (page / totalPages * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = page / elapsed;
    const remaining = Math.ceil((totalPages - page) / rate);
    const min = Math.floor(remaining / 60), sec = remaining % 60;
    process.stdout.write(`\r  ${cyan(pct + '%')} ${dim(`pág ${page}/${totalPages}`)} Sub: ${green(uploaded)} 🔑: ${green(serversFound)} Skip: ${dim(skipped)} Err: ${errors ? red(errors) : dim(0)} ETA: ${yellow(`${min}m ${sec}s`)}   `);
    await sleep(100);
  }

  if (buffer.length) await uploadBatch(buffer);
  console.log(`\n  ${green('✅')} ${label}: ${green(uploaded)} subidos, 🔑 ${green(serversFound)} con servers, ${dim(skipped)} saltados\n`);
  return { uploaded, errors };
}

// ── Borrar contenidos ────────────────────────────────────────────────────────
// Borra por source (para docs que tienen campo source)
async function deleteBySource(source, label) {
  process.stdout.write(cyan(`\n  🗑️  Borrando ${label} (source='${source}')...`));
  let total = 0, snap;
  do {
    try {
      snap = await db.collection('content').where('source', '==', source).limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.docs.length;
      process.stdout.write(`\r  🗑️  Borrados: ${yellow(total)}...   `);
      await sleep(1000);
    } catch(e) {
      if (String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(yellow('\n  ⚠️  Quota — esperando 60s...'));
        await sleep(60000);
      } else throw e;
    }
  } while (!snap?.empty);
  console.log(`\n  ${green('✅')} ${total} documentos eliminados.\n`);
  return total;
}

// Borra TODOS los documentos de la colección content
async function deleteAllContent() {
  process.stdout.write(cyan('\n  🗑️  Borrando TODO el contenido...'));
  let total = 0;
  while (true) {
    try {
      const snap = await db.collection('content').limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.docs.length;
      process.stdout.write(`\r  🗑️  Borrados: ${yellow(total)}...   `);
      await sleep(1000);
    } catch(e) {
      if (String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(yellow('\n  ⚠️  Quota — esperando 60s...'));
        await sleep(60000);
      } else throw e;
    }
  }
  console.log(`\n  ${green('✅')} ${total} documentos eliminados.\n`);
}

// ── Menú ─────────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.clear();
  console.log(`\n${c.purple}${c.bold}  ╔════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  📺  SCRAPER CUEVANA.BI  →  FIREBASE                   ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╠════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  Catálogo: cuevana.gs API · Servers: cuevana.bi tokens  ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  doc_id: movie_{id} / series_{id} (= Python scraper)    ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╚════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`  ${bold('Opciones:')}`);
  console.log(`  [1] 🎯  Scrapear TODO con tokens (películas + series + animes)`);
  console.log(`  [2] 🎬  Scrapear solo Películas con tokens`);
  console.log(`  [3] 📺  Scrapear solo Series con tokens`);
  console.log(`  [4] 🅰️   Scrapear solo Animes con tokens`);
  console.log(`  [5] ⚡  Scrapear TODO SIN tokens (solo metadata, rápido)`);
  console.log(`  [6] 🗑️   Borrar TODO el contenido de Firebase`);
  console.log(`  [7] 🔄  FLUJO COMPLETO: borrar todo → scrapear todo con tokens`);
  console.log(`  [8] ❌  Salir\n`);

  const choice = (await ask(`  Opción → `)).trim();
  if (choice === '8') { rl.close(); return; }
  if (choice === '6') { 
    const confirm = (await ask(`  ${red('⚠️  ¿Borrar TODO el contenido? Esto es irreversible.')} (s/n) → `)).toLowerCase();
    if (confirm === 's') await deleteAllContent();
    rl.close(); return; 
  }

  let skipExisting = false;
  const skipQ = await ask(`  ${yellow('¿Saltar ítems ya existentes?')} (s/n) → `);
  skipExisting = skipQ.toLowerCase() === 's';

  if (choice === '7') {
    console.log(`\n  ${bold('📋 FLUJO COMPLETO:')}`);
    console.log(`  1. Borrar TODO el contenido`);
    console.log(`  2. Scrapear todo con servidores de cuevana.bi\n`);
    const confirm = (await ask(`  ${yellow('¿Confirmar?')} (s/n) → `)).toLowerCase();
    if (confirm !== 's') { rl.close(); return; }
    await deleteAllContent();
  }

  const totals = { uploaded: 0, errors: 0 };
  const add = r => { totals.uploaded += r.uploaded; totals.errors += r.errors; };
  const withTokens = !['5'].includes(choice);

  if (['1','5','7'].includes(choice)) {
    add(await scrapeType('movies', 'Películas', skipExisting, withTokens));
    add(await scrapeType('tvshows', 'Series', skipExisting, withTokens));
    add(await scrapeType('animes', 'Animes', skipExisting, withTokens));
  } else if (choice === '2') {
    add(await scrapeType('movies', 'Películas', skipExisting, true));
  } else if (choice === '3') {
    add(await scrapeType('tvshows', 'Series', skipExisting, true));
  } else if (choice === '4') {
    add(await scrapeType('animes', 'Animes', skipExisting, true));
  }

  console.log(`\n  ${green('🎉 ¡Finalizado!')} Total subidos: ${green(totals.uploaded)} | Errores: ${totals.errors > 0 ? red(totals.errors) : green(0)}\n`);
  rl.close();
}

main().catch(e => { console.error(red('\n❌ Error:'), e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * scrape-cuevana.js
 * Scraper interactivo de Cuevana.gs → Firebase Firestore
 * Correr con: node scripts/scrape-cuevana.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Colores ANSI ─────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  purple: '\x1b[35m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgPurple: '\x1b[45m',
  bgDark: '\x1b[40m',
};
const p = (str) => str; // alias
const bold = (s) => `${c.bold}${s}${c.reset}`;
const purple = (s) => `${c.purple}${s}${c.reset}`;
const cyan = (s) => `${c.cyan}${s}${c.reset}`;
const green = (s) => `${c.green}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const red = (s) => `${c.red}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;

// ── Firebase init ────────────────────────────────────────────────────────────
let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawJson) {
  try {
    rawJson = readFileSync(join(__dirname, 'service-account.json'), 'utf-8');
  } catch {
    console.error(red('❌ No se encontró scripts/service-account.json'));
    process.exit(1);
  }
}
let serviceAccount;
try { serviceAccount = JSON.parse(rawJson); } catch (e) {
  console.error(red('❌ Error parseando credenciales: ' + e.message)); process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── Constantes ───────────────────────────────────────────────────────────────
const BASE_URL = 'https://cuevana.gs';
const API = `${BASE_URL}/wp-api/v1`;
const POSTS_PER_PAGE = 24;

const GENRE_MAP = {
  12: 'Aventura', 14: 'Fantasía', 16: 'Animación', 18: 'Drama',
  27: 'Terror', 28: 'Acción', 35: 'Comedia', 36: 'Historia',
  37: 'Western', 53: 'Drama', 54: 'Romance', 80: 'Crimen',
  81: 'Comedia', 99: 'Documental', 163: 'Fantasía', 190: 'Thriller',
  345: 'Misterio', 878: 'Ciencia Ficción', 1502: 'Suspenso',
  9648: 'Misterio', 10402: 'Música', 10749: 'Romance',
  10751: 'Familia', 10752: 'Bélica', 10770: 'Película de TV',
};

// ── Estado global de progreso ────────────────────────────────────────────────
let stats = { processed: 0, uploaded: 0, skipped: 0, errors: 0, startTime: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, */*',
          'Referer': BASE_URL,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

function mapGenres(genreIds) {
  if (!genreIds?.length) return 'Varios';
  const names = genreIds.map(id => GENRE_MAP[id]).filter(g => g && !['HD', 'FullHD'].includes(g));
  return names[0] || 'Varios';
}

const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w1280';

function buildPoster(post) {
  // Preferir imagen de Cuevana CDN (images.poster) → siempre funciona sin hotlink
  if (post.images?.poster) return `${BASE_URL}${post.images.poster}`;
  // Fallback: ruta TMDB directa (post.poster tiene formato /abc123.jpg)
  if (post.poster) return `${TMDB_IMG}${post.poster}`;
  return '';
}

function buildBackdrop(post) {
  if (post.images?.backdrop) return `${BASE_URL}${post.images.backdrop}`;
  if (post.backdrop) return `${TMDB_BACKDROP}${post.backdrop}`;
  return '';
}

function progressBar(current, total, width = 30) {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${purple(bar)} ${yellow((pct * 100).toFixed(1) + '%')}`;
}

function eta(current, total) {
  if (!stats.startTime || current === 0) return '--:--';
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rate = current / elapsed;
  const remaining = (total - current) / rate;
  if (!isFinite(remaining)) return '--:--';
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = Math.floor(remaining % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

function printProgress(current, total, label = '') {
  const bar = progressBar(current, total);
  const etaStr = eta(current, total);
  process.stdout.write(`\r  ${bar} ${dim(`${current}/${total}`)} ${cyan('ETA: ' + etaStr)} ${dim(label)}   `);
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchListing(type, page = 1) {
  const url = `${API}/listing/${type}?page=${page}&orderBy=false&order=desc&postType=${type}&postsPerPage=${POSTS_PER_PAGE}`;
  const data = await fetchJSON(url);
  return data?.data || { posts: [], pagination: {} };
}

async function fetchPlayer(postId) {
  try {
    const data = await fetchJSON(`${API}/player?postId=${postId}&demo=0`);
    return data?.data || null;
  } catch { return null; }
}

async function fetchEpisodes(seriesId, season) {
  try {
    const data = await fetchJSON(`${API}/single/episodes/list?_id=${seriesId}&season=${season}&page=1&postsPerPage=50`);
    return data?.data?.posts || [];
  } catch { return []; }
}

async function fetchSearch(query) {
  const data = await fetchJSON(`${API}/search?q=${encodeURIComponent(query)}&page=1&postType=any&postsPerPage=18`);
  return data?.data?.posts || [];
}

async function transformItem(post, fetchLinks, forceType) {
  // Mapear tipo: movies→movie, tvshows→series, animes→anime
  const typeMap = { movies: 'movie', tvshows: 'series', animes: 'anime' };
  const contentType = forceType || typeMap[post.type] || 'movie';
  const isSeries = contentType === 'series' || contentType === 'anime';

  const item = {
    id: `cuevana-${post._id}`,
    tmdb_id: post._id?.toString(),
    slug: post.slug || '',
    type: contentType,
    title: post.title || 'Sin título',
    year: post.release_date?.split('-')[0] || '',
    genre: mapGenres(post.genres),
    poster: buildPoster(post),
    backdrop: buildBackdrop(post),
    description: post.overview || '',
    rating: post.rating?.toString() || '',
    source: 'cuevana',
    updatedAt: Date.now(),
  };

  if (isSeries) {
    item.seasonsData = [];
    item.episodeLinks = {};
  } else {
    item.videoUrl = '';
    item.servers = [];
  }

  if (fetchLinks) {
    const player = await fetchPlayer(post._id);
    if (player?.embeds?.length) {
      item.servers = player.embeds.map((e, i) => ({
        // 'Online' es el nombre genérico del servidor, usamos lang+quality como nombre real
        name: `${e.lang || 'LAT'} · ${e.quality || 'HD'}`,
        url: e.url || `${BASE_URL}/player.php?t=${e.token}&server=${e.server}`,
        server: e.server || 'online',
      }));
      item.videoUrl = item.servers[0]?.url || '';
    }
  }
  return item;
}

// Alias para retrocompatibilidad — delegan en transformItem con tipo explícito
const transformMovie = (post, fetchLinks) => transformItem(post, fetchLinks, 'movie');

async function transformSeries(post, fetchLinks) {
  const item = await transformItem(post, fetchLinks, 'series');

  // Nivel profundo: cargar episodios y sus links si se pide
  if (fetchLinks && post._id) {
    for (let season = 1; season <= 20; season++) {
      const episodes = await fetchEpisodes(post._id, season);
      if (!episodes.length) break;
      item.seasonsData.push({ season, episodes: episodes.length });
      for (const ep of episodes) {
        const epNum = ep.episode_number || ep.number || ep.order || 1;
        const key = `${season}-${epNum}`;
        const player = await fetchPlayer(ep._id);
        if (player?.embeds?.length) {
          item.episodeLinks[key] = player.embeds.map(e =>
            e.url || `${BASE_URL}/player.php?t=${e.token}&server=${e.server}`
          );
        }
        await sleep(250);
      }
      await sleep(500);
    }
  }
  return item;
}

async function transformAnime(post, fetchLinks) {
  // Animes en Cuevana son series de episodios
  return transformSeries({ ...post, type: 'animes' }, fetchLinks);
}


// ── Firebase Upload ───────────────────────────────────────────────────────────
// Obtener IDs ya existentes para hacer skip
async function getExistingIds() {
  process.stdout.write(dim('  Verificando items existentes en Firebase... '));
  const snap = await db.collection('content').where('source', '==', 'cuevana').select().get();
  const ids = new Set(snap.docs.map(d => d.id));
  console.log(green(`${ids.size} encontrados`));
  return ids;
}

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

// ── Core Scraper ──────────────────────────────────────────────────────────────
async function runScrape({ type, maxPages, fetchLinks, skipExisting }) {
  const typeLabel = { movies: '🎬 Películas', tvshows: '📺 Series', animes: '🅰  Animes' }[type];
  console.log(`\n${bold(typeLabel)} — Obteniendo total de páginas...`);

  const firstPage = await fetchListing(type, 1);
  const totalPages = Math.min(firstPage.pagination?.last_page || 1, maxPages || 99999);
  const totalItems = totalPages * POSTS_PER_PAGE;

  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('~Items:')} ${totalItems}  ${cyan('Links:')} ${fetchLinks ? yellow('Sí (lento)') : green('No (rápido)')}`);

  let existingIds = new Set();
  if (skipExisting) existingIds = await getExistingIds();

  stats = { processed: 0, uploaded: 0, skipped: 0, errors: 0, startTime: Date.now() };
  const batchBuffer = [];

  for (let page = 1; page <= totalPages; page++) {
    let posts;
    try {
      const data = await fetchListing(type, page);
      posts = data.posts;
    } catch (e) {
      stats.errors++;
      await sleep(3000);
      continue;
    }
    if (!posts?.length) break;

    for (const post of posts) {
      stats.processed++;
      const id = `cuevana-${post._id}`;

      if (skipExisting && existingIds.has(id)) {
        stats.skipped++;
        printProgress(stats.processed, totalItems, `Saltado: ${post.title?.slice(0, 25)}`);
        continue;
      }

      try {
        let item;
        if (type === 'tvshows') {
          item = await transformSeries(post, fetchLinks);
        } else if (type === 'animes') {
          item = await transformAnime(post, fetchLinks);
        } else {
          item = await transformMovie(post, fetchLinks);
        }
        batchBuffer.push(item);
        stats.uploaded++;

        // Subir en lotes de 200 para no acumular demasiado en memoria
        if (batchBuffer.length >= 200) {
          await uploadBatch(batchBuffer.splice(0));
        }

        if (fetchLinks) await sleep(600);
      } catch (e) {
        stats.errors++;
      }

      printProgress(stats.processed, totalItems, post.title?.slice(0, 25) || '');
    }

    if (!fetchLinks) await sleep(200);
  }

  // Subir remainder
  if (batchBuffer.length) await uploadBatch(batchBuffer);

  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  console.log(`\n\n  ${green('✅ Completado!')}  Subidos: ${green(stats.uploaded)}  Saltados: ${yellow(stats.skipped)}  Errores: ${red(stats.errors)}  Tiempo: ${cyan(elapsed + 's')}\n`);
}

async function runSearch(query) {
  console.log(`\n${bold('🔍 Buscando:')} ${cyan(query)}...`);
  const posts = await fetchSearch(query);
  if (!posts.length) { console.log(yellow('  Sin resultados.')); return; }
  console.log(`  ${green(posts.length)} resultados encontrados\n`);

  const items = [];
  for (const post of posts) {
    let fn;
    if (post.type === 'tvshows') fn = transformSeries;
    else if (post.type === 'animes') fn = transformAnime;
    else fn = transformMovie;
    items.push(await fn(post, true));
    process.stdout.write(`  Procesando: ${dim(post.title?.slice(0, 40))}...\r`);
    await sleep(600);
  }
  await uploadBatch(items);
  console.log(`\n  ${green('✅')} ${items.length} items subidos a Firebase.\n`);
}

// ── Menú interactivo ──────────────────────────────────────────────────────────
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function printBanner() {
  console.log(`\n${purple('  ╔══════════════════════════════════════════════╗')}`);
  console.log(`${purple('  ║')} ${bold('     🎬  CUEVANA SCRAPER  →  FIREBASE')}        ${purple('║')}`);
  console.log(`${purple('  ╚══════════════════════════════════════════════╝')}\n`);
}

function printMenu() {
  const opts = [
    ['1', '🎬  Películas — Solo metadata (rápido, ~25min para todo)', 'recommended'],
    ['2', '🎬  Películas — Con links de video (lento, ~8-12hs)'],
    ['3', '📺  Series — Solo metadata (rápido)'],
    ['4', '📺  Series — Con links + episodios (muy lento)'],
    ['5', '🅰   Animes — Solo metadata'],
    ['6', '🎯  TODO — Películas + Series + Animes (metadata, ~1hs)'],
    ['7', '🔍  Buscar título específico'],
    ['8', '📊  Ver estadísticas de Firebase'],
    ['9', '❌  Salir'],
  ];

  console.log(`${bold('  Elegí una opción:')}\n`);
  opts.forEach(([num, label, tag]) => {
    const badge = tag === 'recommended' ? green(' ← RECOMENDADO') : '';
    console.log(`  ${purple(`[${num}]`)} ${label}${badge}`);
  });
  console.log('');
}

async function askQuestion(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function showStats() {
  console.log(`\n${bold('  📊 Estadísticas de Firebase')}...\n`);
  try {
    const snap = await db.collection('content').where('source', '==', 'cuevana').select('type').get();
    let movies = 0, series = 0, animes = 0, other = 0;
    snap.docs.forEach(d => {
      const t = d.data().type;
      if (t === 'movie') movies++;
      else if (t === 'series') series++;
      else if (t === 'anime') animes++;
      else other++;
    });
    console.log(`  ${cyan('Películas:')}  ${bold(movies)}`);
    console.log(`  ${cyan('Series:')}     ${bold(series)}`);
    console.log(`  ${cyan('Animes:')}     ${bold(animes)}`);
    console.log(`  ${cyan('Total:')}      ${bold(snap.size)}`);
  } catch (e) {
    console.log(red('  Error al consultar Firebase: ' + e.message));
  }
}

async function askScrapeOptions(rl, type, fetchLinks) {
  const pagesAns = await askQuestion(rl, `  ${cyan('¿Cuántas páginas? (Enter = TODAS):')} `);
  const maxPages = pagesAns.trim() ? parseInt(pagesAns) : undefined;

  const skipAns = await askQuestion(rl, `  ${cyan('¿Saltar items ya subidos? (S/n):')} `);
  const skipExisting = skipAns.trim().toLowerCase() !== 'n';

  console.log('');
  if (maxPages) {
    console.log(`  ${dim(`→ Scrapeando ${maxPages} páginas (~${maxPages * POSTS_PER_PAGE} items)`)}`);
  } else {
    const first = await fetchListing(type, 1);
    const total = first.pagination?.last_page || 1;
    console.log(`  ${dim(`→ Scrapeando TODAS (${total} páginas, ~${total * POSTS_PER_PAGE} items)`)}`);
    console.log(`  ${fetchLinks ? yellow('  ⚠️  Con links puede tardar 8-12 horas') : green('  ✅ Sin links tarda ~25 minutos')}`);
    const confirm = await askQuestion(rl, `\n  ${bold('¿Confirmar? (S/n):')} `);
    if (confirm.trim().toLowerCase() === 'n') return;
  }

  await runScrape({ type, maxPages, fetchLinks, skipExisting });
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    clearScreen();
    printBanner();
    printMenu();

    const answer = await askQuestion(rl, `  ${bold('Opción')} ${purple('→')} `);
    const choice = answer.trim();

    console.log('');

    try {
      if (choice === '1') {
        await askScrapeOptions(rl, 'movies', false);
      } else if (choice === '2') {
        console.log(yellow('  ⚠️  Este modo tarda ~8-12 horas para el catálogo completo.'));
        await askScrapeOptions(rl, 'movies', true);
      } else if (choice === '3') {
        await askScrapeOptions(rl, 'tvshows', false);
      } else if (choice === '4') {
        console.log(yellow('  ⚠️  Series completas con episodios puede tardar días.'));
        await askScrapeOptions(rl, 'tvshows', true);
      } else if (choice === '5') {
        await askScrapeOptions(rl, 'animes', false);
      } else if (choice === '6') {
        console.log(bold('  🚀 Scrapeando TODO (metadata)...\n'));
        const skipAns = await askQuestion(rl, `  ${cyan('¿Saltar items ya subidos? (S/n):')} `);
        const skipExisting = skipAns.trim().toLowerCase() !== 'n';
        await runScrape({ type: 'movies', fetchLinks: false, skipExisting });
        await runScrape({ type: 'tvshows', fetchLinks: false, skipExisting });
        await runScrape({ type: 'animes', fetchLinks: false, skipExisting });
        console.log(green('  ✅ ¡Todo el catálogo scrapeado!\n'));
      } else if (choice === '7') {
        const query = await askQuestion(rl, `  ${cyan('¿Qué título buscás?')} `);
        if (query.trim()) await runSearch(query.trim());
      } else if (choice === '8') {
        await showStats();
      } else if (choice === '9' || choice.toLowerCase() === 's') {
        console.log(green('  👋 ¡Hasta luego!\n'));
        rl.close();
        process.exit(0);
      } else {
        console.log(yellow('  Opción no válida.'));
      }
    } catch (e) {
      console.log(red('\n  ❌ Error: ' + e.message));
    }

    await askQuestion(rl, `\n  ${dim('Presioná Enter para volver al menú...')} `);
  }
}

main();

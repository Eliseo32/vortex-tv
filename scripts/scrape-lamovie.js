#!/usr/bin/env node
/**
 * scrape-lamovie.js  v2.0
 *
 * 🔥 Scraper Masivo: la.movie → Firebase  (CORREGIDO)
 *
 * Correcciones v2:
 *  - Imágenes: usa CDN correcto (https://la.movie/wp-content/uploads + path)
 *  - Posters TMDB: extrae poster real de TMDB via gallery paths
 *  - Player: guarda embeds externos directos (vimeos.net, goodstream, hlswish, voe)
 *  - Metadata enriquecida: busca TMDB para poster/backdrop/overview confiables
 *
 * APIs:
 *  - Catálogo:  GET /wp-api/v1/listing/{type}?page={n}&postsPerPage=24
 *  - Servers:   GET /wp-api/v1/player?postId={id}&demo=0
 *  - Episodios: GET /wp-api/v1/single/episodes/list?_id={id}&season={n}
 *
 * Correr: node scripts/scrape-lamovie.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Colores ───────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  purple: '\x1b[35m', cyan: '\x1b[36m', green: '\x1b[32m',
  yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m',
};
const bold   = s => `${c.bold}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const red    = s => `${c.red}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;
const blue   = s => `${c.blue}${s}${c.reset}`;

// ── Firebase ──────────────────────────────────────────────────────────────────
let rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!rawJson) {
  try { rawJson = readFileSync(join(__dirname, 'service-account.json'), 'utf-8'); }
  catch { console.error(red('❌ No se encontró scripts/service-account.json')); process.exit(1); }
}
initializeApp({ credential: cert(JSON.parse(rawJson)) });
const db = getFirestore();

// ── Constantes ────────────────────────────────────────────────────────────────
const BASE       = 'https://la.movie';
const API        = `${BASE}/wp-api/v1`;
const CDN_IMG    = `${BASE}/wp-content/uploads`; // ← URL real de imagenes del sitio
const TMDB_IMG   = 'https://image.tmdb.org/t/p';  // TMDB image CDN
const PPP        = 24;
const sleep      = ms => new Promise(r => setTimeout(r, ms));

// TMDB API keys (extraídas del código fuente de la.movie)
const TMDB_KEYS = [
  '10923b261ba94d897ac6b81148314a3f',
  'b573d051ec65413c949e68169923f7ff',
  'da40aaeca884d8c9a9a4c088917c474c',
  '4e44d9029b1270a757cddc766a1bcb63',
  '39151834c95219c3cae772b4465079d7',
];
let tmdbKeyIdx = 0;
function getTmdbKey() { return TMDB_KEYS[tmdbKeyIdx++ % TMDB_KEYS.length]; }

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  'Referer':         BASE + '/',
  'Origin':          BASE,
};

// ── Mapas ─────────────────────────────────────────────────────────────────────
const TYPE_MAP = { movies: 'movie', tvshows: 'series', animes: 'anime' };

const GENRE_MAP = {
  17:'Drama', 18:'Comedia', 33:'Suspense', 32:'Acción', 520:'Animación',
  96:'Terror', 130:'Aventura', 180:'Crimen', 115:'Romance', 398:'Familia',
  97:'Misterio', 131:'Ciencia Ficción', 229:'Fantasía', 704:'Sci-Fi & Fantasy',
  705:'Acción & Aventura', 165:'Historia', 164:'Documental', 8:'Música',
  6787:'Película de TV', 3056:'Bélica', 674:'Western', 703:'Kids',
  786:'War & Politics', 12485:'Reality', 19824:'Soap',
};

const LANG_MAP = {
  58651:'Latino', 58652:'Inglés', 58653:'Castellano',
  58654:'Japonés', 58655:'Subtitulado',
};

function mapGenres(ids = []) {
  const mapped = ids.map(id => GENRE_MAP[id]).filter(Boolean);
  return mapped.length ? mapped : ['Varios'];
}
function mapLangs(ids = []) {
  return [...new Set(ids.map(id => LANG_MAP[id]).filter(Boolean))];
}

// ── Imagen URLs (CORREGIDAS) ──────────────────────────────────────────────────

/**
 * Construye la URL real de la imagen del sitio la.movie
 * El path viene como: /thumbs/hash_hd.webp, /backdrops/hash.webp, /logos/hash.webp
 * La URL real es: https://la.movie/wp-content/uploads + path
 */
function buildSiteImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return CDN_IMG + path;
}

/**
 * Extrae el primer path del gallery (son paths de TMDB) y construye la URL TMDB completa
 * Gallery viene como: "/u8DU5fkLoM5tTRukzPC31oGPxaQ.jpg\n/iN41Ccw4..."
 * Cada línea es un path TMDB
 */
function extractTmdbImages(gallery) {
  if (!gallery) return { poster: '', backdrop: '' };
  const paths = gallery.split('\n').map(p => p.trim()).filter(p => p && p.startsWith('/'));
  return {
    poster:   paths[0] ? `${TMDB_IMG}/w500${paths[0]}` : '',
    backdrop: paths[1] ? `${TMDB_IMG}/w1280${paths[1]}` : '',
    // Más imágenes extras si las necesitamos
    gallery:  paths.slice(0, 5).map(p => `${TMDB_IMG}/w500${p}`),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractServerName(url, fallback) {
  if (!url) return fallback;
  try {
    const match = url.match(/https?:\/\/(?:www\.)?([^\/.]+)/);
    if (match && match[1]) {
      const host = match[1];
      return host.charAt(0).toUpperCase() + host.slice(1);
    }
  } catch {}
  return fallback;
}

// ── Fetch con reintentos ──────────────────────────────────────────────────────
async function fetchJSON(url, retries = 3, delay = 1200) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 429) {
        const wait = 30000 + i * 15000;
        process.stdout.write(yellow(`\n  ⚠️  Rate limit (429) — esperando ${wait/1000}s...\n`));
        await sleep(wait);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} → ${url}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(delay * (i + 1));
    }
  }
}

// ── TMDB Search (para enriquecer metadata + poster real) ──────────────────────
async function searchTmdb(title, year, type = 'movie') {
  try {
    const mediaType = type === 'movie' ? 'movie' : 'tv';
    const key = getTmdbKey();
    const query = encodeURIComponent(title.replace(/\(\d{4}\)$/, '').trim());
    let url = `https://api.themoviedb.org/3/search/${mediaType}?api_key=${key}&language=es-MX&query=${query}`;
    if (year) url += `&year=${year}`;
    const data = await fetchJSON(url, 2, 500);
    if (data?.results?.length > 0) {
      const r = data.results[0];
      return {
        tmdb_id:     r.id,
        poster:      r.poster_path ? `${TMDB_IMG}/w500${r.poster_path}` : '',
        backdrop:    r.backdrop_path ? `${TMDB_IMG}/w1280${r.backdrop_path}` : '',
        overview:    r.overview || '',
        voteAvg:     r.vote_average?.toString() || '',
        releaseDate: r.release_date || r.first_air_date || '',
      };
    }
  } catch {}
  return null;
}

// ── API: Listado ──────────────────────────────────────────────────────────────
async function fetchListing(type, page) {
  // Cambio a orderBy=date para asegurar consistencia en la paginación y que no salte películas
  const url = `${API}/listing/${type}?page=${page}&orderBy=date&order=desc&postType=${type}&postsPerPage=${PPP}`;
  const data = await fetchJSON(url);
  return data?.data || { posts: [], pagination: {} };
}

// ── API: Servidores ───────────────────────────────────────────────────────────
async function fetchPlayer(postId) {
  try {
    const url = `${API}/player?postId=${postId}&demo=0`;
    const data = await fetchJSON(url, 2, 800);
    const embeds    = data?.data?.embeds    || [];
    const downloads = data?.data?.downloads || [];
    return { embeds, downloads };
  } catch {
    return { embeds: [], downloads: [] };
  }
}

// ── API: Episodios ────────────────────────────────────────────────────────────
async function fetchEpisodes(seriesId, season) {
  try {
    const url = `${API}/single/episodes/list?_id=${seriesId}&season=${season}&page=1&postsPerPage=50`;
    const data = await fetchJSON(url, 2, 800);
    return data?.data?.episodes || data?.data?.posts || [];
  } catch {
    return [];
  }
}

// ── Detectar temporadas ───────────────────────────────────────────────────────
async function detectSeasons(seriesId) {
  const seasons = [];
  for (let s = 1; s <= 30; s++) {
    const eps = await fetchEpisodes(seriesId, s);
    if (!eps || eps.length === 0) break;
    seasons.push({ season: s, episodes: eps });
    await sleep(200);
  }
  return seasons;
}

// ── Transformar post → doc Firebase ──────────────────────────────────────────
function transformPost(post, apiType, player = null, seasonsData = null, tmdbData = null) {
  const type  = TYPE_MAP[post.type] || TYPE_MAP[apiType] || 'movie';
  const docId = `${type}_${post._id}`;

  const genres = mapGenres(post.genres);
  const langs  = mapLangs(post.lang);

  // Imágenes: prioridad TMDB > gallery TMDB > site CDN
  const tmdbFromGallery = extractTmdbImages(post.gallery);

  const poster = tmdbData?.poster
    || tmdbFromGallery.poster
    || buildSiteImageUrl(post.images?.poster);

  const backdrop = tmdbData?.backdrop
    || tmdbFromGallery.backdrop
    || buildSiteImageUrl(post.images?.backdrop);

  const doc = {
    id:             docId,
    lamovie_id:     post._id?.toString(),
    slug:           post.slug || '',
    type,
    title:          post.title || 'Sin título',
    originalTitle:  post.original_title || '',
    year:           post.release_date?.split('-')[0] || '',
    releaseDate:    post.release_date || '',
    genre:          genres[0] || 'Varios',
    genres,
    langs,
    certification:  post.certification || '',
    runtime:        post.runtime ? `${Math.round(parseFloat(post.runtime))} min` : '',
    // Imágenes reales y funcionales
    poster,
    backdrop,
    logo:           buildSiteImageUrl(post.images?.logo),
    posterSite:     buildSiteImageUrl(post.images?.poster),   // backup del sitio
    backdropSite:   buildSiteImageUrl(post.images?.backdrop), // backup del sitio
    tmdbGallery:    tmdbFromGallery.gallery,                  // array de URLs TMDB
    description:    tmdbData?.overview || post.overview || '',
    rating:         post.rating?.toString() || '',
    imdbRating:     post.imdb_rating?.toString() || '',
    communityRating: post.community_rating?.toString() || '',
    trailer:        post.trailer ? `https://www.youtube.com/watch?v=${post.trailer}` : '',
    trailerKey:     post.trailer || '',
    tagline:        post.tagline || '',
    tmdb_id:        tmdbData?.tmdb_id?.toString() || '',
    source:         'lamovie',
    updatedAt:      Date.now(),
    lastSiteUpdate: post.last_update || '',
  };

  // ── Servers (embeds directos a los reproductores externos) ──
  if (player) {
    // Estos son links DIRECTOS a reproductores externos (vimeos.net, goodstream, etc.)
    // NO son links de la.movie - se abren directo en un WebView/iframe
    doc.servers = player.embeds.map(e => ({
      name:    extractServerName(e.url, e.server !== 'Online' ? e.server : null || 'Servidor Premium'),
      url:     e.url || '',
      lang:    e.lang || '',
      quality: e.quality || '',
      type:    'embed',
    })).sort((a, b) => {
      const isVimeoA = a.name.toLowerCase().includes('vimeo');
      const isVimeoB = b.name.toLowerCase().includes('vimeo');
      if (isVimeoA && !isVimeoB) return -1;
      if (!isVimeoA && isVimeoB) return 1;
      return 0;
    });
    doc.downloads = player.downloads.map(d => ({
      name: d.server || 'Download',
      url:  d.url || '',
      lang: d.lang || '',
      quality: d.quality || '',
      size: d.size || '',
    }));
    // El videoUrl es el primer embed directo (para el reproductor de la app)
    doc.videoUrl = doc.servers?.[0]?.url || '';
  } else {
    doc.servers   = [];
    doc.downloads = [];
    doc.videoUrl  = '';
  }

  // ── Series/Anime: temporadas y episodios ──
  if (type !== 'movie' && seasonsData && seasonsData.length > 0) {
    doc.seasonsData = seasonsData.map(s => ({
      season:   s.season,
      episodes: s.episodes.map(ep => {
        const sortedServers = (ep.servers || []).map(srv => ({
           ...srv,
           name: extractServerName(srv.url || srv.iframe, srv.name !== 'Online' ? srv.name : null || srv.server || 'Servidor Premium'),
        })).sort((a, b) => {
          const nameA = String(a.name).toLowerCase();
          const nameB = String(b.name).toLowerCase();
          if (nameA.includes('vimeo') && !nameB.includes('vimeo')) return -1;
          if (!nameA.includes('vimeo') && nameB.includes('vimeo')) return 1;
          return 0;
        });

        return {
          id:            ep._id?.toString() || '',
          title:         ep.title || `Episodio ${ep.episode_number || '?'}`,
          episodeNumber: ep.episode_number || 0,
          overview:      ep.overview || '',
          still:         ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : '',
          servers:       sortedServers,
          videoUrl:      sortedServers[0]?.url || sortedServers[0]?.iframe || ep.videoUrl || '',
        };
      }),
    }));
    doc.totalSeasons  = seasonsData.length;
    doc.totalEpisodes = seasonsData.reduce((a, s) => a + s.episodes.length, 0);
  }

  return doc;
}

// ── Upload batch ──────────────────────────────────────────────────────────────
async function uploadBatch(items) {
  const CHUNK = 400;
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = db.batch();
    items.slice(i, i + CHUNK).forEach(item => {
      batch.set(db.collection('content').doc(item.id), item, { merge: true });
    });
    try {
      await batch.commit();
    } catch (e) {
      if (String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(yellow('\n  ⚠️  Quota — esperando 60s...'));
        await sleep(60000);
        const b2 = db.batch();
        items.slice(i, i + CHUNK).forEach(item => {
          b2.set(db.collection('content').doc(item.id), item, { merge: true });
        });
        await b2.commit();
      } else throw e;
    }
  }
}

// ── IDs existentes ────────────────────────────────────────────────────────────
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

// ── Scrape Películas (metadata + TMDB posters) ───────────────────────────────
async function scrapeMoviesMeta(skipExisting = false, useTmdb = true) {
  process.stdout.write(`\n  ${bold('🎬 Scrapeando Películas (metadata' + (useTmdb ? ' + TMDB' : '') + ')...')}\n`);
  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    existingIds = await getExistingIds();
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  const first = await fetchListing('movies', 1);
  const totalPages = first.pagination?.last_page || 1;
  const total      = first.pagination?.total || '?';
  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('Total estimado:')} ${total}`);

  let uploaded = 0, skipped = 0, errors = 0, tmdbHits = 0;
  const startTime = Date.now();
  const buffer = [];

  for (let page = 1; page <= totalPages; page++) {
    let posts;
    try {
      const data = await fetchListing('movies', page);
      posts = data.posts || [];
    } catch { errors++; await sleep(3000); continue; }

    for (const post of posts) {
      const docId = `movie_${post._id}`;
      if (skipExisting && existingIds.has(docId)) { skipped++; continue; }
      try {
        let tmdbData = null;
        if (useTmdb) {
          const year = post.release_date?.split('-')[0];
          tmdbData = await searchTmdb(post.title, year, 'movie');
          if (tmdbData) tmdbHits++;
          await sleep(100); // TMDB rate limit
        }
        buffer.push(transformPost(post, 'movies', null, null, tmdbData));
        uploaded++;
        if (buffer.length >= 80) await uploadBatch(buffer.splice(0));
      } catch { errors++; }
    }

    const pct = (page / totalPages * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = page / elapsed;
    const remaining = Math.ceil((totalPages - page) / (rate || 0.1));
    const min = Math.floor(remaining / 60), sec = remaining % 60;
    process.stdout.write(`\r  ${cyan(pct + '%')} Pág: ${dim(page + '/' + totalPages)} Sub: ${green(uploaded)} TMDB: ${blue(tmdbHits)} Skip: ${dim(skipped)} Err: ${errors ? red(errors) : dim(0)} ETA: ${yellow(min + 'm ' + sec + 's')}   `);
    await sleep(60);
  }
  if (buffer.length) await uploadBatch(buffer);
  console.log(`\n  ${green('✅')} Películas: ${green(uploaded)} subidas, TMDB: ${blue(tmdbHits)}\n`);
  return { uploaded, errors };
}

// ── Scrape Películas + Servers ────────────────────────────────────────────────
async function scrapeMoviesWithServers(skipExisting = false, useTmdb = true) {
  process.stdout.write(`\n  ${bold('🎬🔑 Scrapeando Películas + Servers...')}\n`);
  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    existingIds = await getExistingIds();
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  const first = await fetchListing('movies', 1);
  const totalPages = first.pagination?.last_page || 1;
  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('Total:')} ${first.pagination?.total || '?'}`);

  let uploaded = 0, skipped = 0, errors = 0, withServers = 0;
  const startTime = Date.now();
  const buffer = [];

  for (let page = 1; page <= totalPages; page++) {
    let posts;
    try {
      const data = await fetchListing('movies', page);
      posts = data.posts || [];
    } catch { errors++; await sleep(3000); continue; }

    for (const post of posts) {
      const docId = `movie_${post._id}`;
      if (skipExisting && existingIds.has(docId)) { skipped++; continue; }
      try {
        const player = await fetchPlayer(post._id);
        if (player.embeds.length > 0) withServers++;

        let tmdbData = null;
        if (useTmdb) {
          const year = post.release_date?.split('-')[0];
          tmdbData = await searchTmdb(post.title, year, 'movie');
          await sleep(80);
        }

        buffer.push(transformPost(post, 'movies', player, null, tmdbData));
        uploaded++;
        if (buffer.length >= 50) await uploadBatch(buffer.splice(0));
        await sleep(180);
      } catch { errors++; }
    }

    const pct = (page / totalPages * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = page / elapsed;
    const remaining = Math.ceil((totalPages - page) / (rate || 0.1));
    const min = Math.floor(remaining / 60), sec = remaining % 60;
    process.stdout.write(`\r  ${cyan(pct + '%')} Pág: ${dim(page + '/' + totalPages)} Sub: ${green(uploaded)} 🔑: ${green(withServers)} Skip: ${dim(skipped)} Err: ${errors ? red(errors) : dim(0)} ETA: ${yellow(min + 'm ' + sec + 's')}   `);
    await sleep(80);
  }
  if (buffer.length) await uploadBatch(buffer);
  console.log(`\n  ${green('✅')} Películas: ${green(uploaded)} subidas, 🔑 ${green(withServers)} con servers\n`);
  return { uploaded, errors };
}

// ── Scrape Series/Animes ──────────────────────────────────────────────────────
async function scrapeSeries(apiType, label, withServers = false, skipExisting = false, useTmdb = true) {
  const typeLabel = apiType === 'animes' ? '🔴' : '📺';
  process.stdout.write(`\n  ${bold(`${typeLabel} Scrapeando ${label}${withServers ? ' + Servers + Episodios' : ''}...`)}\n`);

  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    existingIds = await getExistingIds();
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  const first = await fetchListing(apiType, 1);
  const totalPages = first.pagination?.last_page || 1;
  console.log(`  ${cyan('Páginas:')} ${totalPages}  ${cyan('Total:')} ${first.pagination?.total || '?'}`);

  let uploaded = 0, skipped = 0, errors = 0, withSrv = 0, totalEps = 0;
  const startTime = Date.now();
  const buffer = [];

  for (let page = 1; page <= totalPages; page++) {
    let posts;
    try {
      const data = await fetchListing(apiType, page);
      posts = data.posts || [];
    } catch { errors++; await sleep(3000); continue; }

    for (const post of posts) {
      const type  = TYPE_MAP[apiType] || 'series';
      const docId = `${type}_${post._id}`;
      if (skipExisting && existingIds.has(docId)) { skipped++; continue; }

      try {
        let player = null;
        let seasonsData = null;

        // TMDB search
        let tmdbData = null;
        if (useTmdb) {
          const year = post.release_date?.split('-')[0];
          tmdbData = await searchTmdb(post.title, year, 'tv');
          await sleep(80);
        }

        if (withServers) {
          player = await fetchPlayer(post._id);
          if (player.embeds.length > 0) withSrv++;
          await sleep(150);

          // Temporadas y episodios
          const seasons = await detectSeasons(post._id);
          if (seasons.length > 0) {
            for (const s of seasons) {
              for (const ep of s.episodes) {
                if (ep._id) {
                  const epPlayer = await fetchPlayer(ep._id);
                  ep.servers = epPlayer.embeds.map(e => ({
                    name: e.server || 'Online', url: e.url || '',
                    lang: e.lang || '', quality: e.quality || '',
                  }));
                  ep.videoUrl = epPlayer.embeds?.[0]?.url || '';
                  totalEps++;
                  await sleep(120);
                }
              }
            }
            seasonsData = seasons;
          }
        }

        buffer.push(transformPost(post, apiType, player, seasonsData, tmdbData));
        uploaded++;
        if (buffer.length >= 30) await uploadBatch(buffer.splice(0));
      } catch { errors++; }
    }

    const pct = (page / totalPages * 100).toFixed(1);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = page / elapsed;
    const remaining = Math.ceil((totalPages - page) / (rate || 0.1));
    const min = Math.floor(remaining / 60), sec = remaining % 60;
    process.stdout.write(`\r  ${cyan(pct + '%')} Pág: ${dim(page + '/' + totalPages)} Sub: ${green(uploaded)} 🔑: ${green(withSrv)} Eps: ${blue(totalEps)} Skip: ${dim(skipped)} Err: ${errors ? red(errors) : dim(0)} ETA: ${yellow(min + 'm ' + sec + 's')}   `);
    await sleep(80);
  }

  if (buffer.length) await uploadBatch(buffer);
  console.log(`\n  ${green('✅')} ${label}: ${green(uploaded)} subidas, 🔑 ${green(withSrv)} con servers, Eps: ${blue(totalEps)}\n`);
  return { uploaded, errors };
}

// ── Borrar por source ─────────────────────────────────────────────────────────
async function deleteBySource() {
  process.stdout.write(cyan('\n  🗑️  Borrando todo el contenido de la.movie (source=lamovie)...'));
  let total = 0, snap;
  do {
    try {
      snap = await db.collection('content').where('source', '==', 'lamovie').limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      total += snap.docs.length;
      process.stdout.write(`\r  🗑️  Borrados: ${yellow(total)}...   `);
      await sleep(700);
    } catch (e) {
      if (String(e).includes('RESOURCE_EXHAUSTED')) {
        console.log(yellow('\n  ⚠️  Quota — esperando 60s...'));
        await sleep(60000);
      } else throw e;
    }
  } while (!snap?.empty);
  console.log(`\n  ${green('✅')} ${total} documentos eliminados.\n`);
}

// ── Menú ──────────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.clear();
  console.log(`\n${c.purple}${c.bold}  ╔══════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║   🔥  SCRAPER LA.MOVIE v2.0  →  FIREBASE  (Vortex TV)       ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╠══════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  📊 ~6,574 Pelis · ~753 Series · ~951 Animes                ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  🖼️  Posters: TMDB HD · 🔑 Servers: embeds directos         ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╚══════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`  ${bold('Opciones:')}`);
  console.log(`  ${cyan('[1]')}  ⚡ TODO metadata + TMDB posters (sin servers)`);
  console.log(`  ${cyan('[2]')}  🎬 Películas + Servers + TMDB`);
  console.log(`  ${cyan('[3]')}  📺 Series + Servers + Episodios + TMDB`);
  console.log(`  ${cyan('[4]')}  🔴 Animes + Servers + Episodios + TMDB`);
  console.log(`  ${cyan('[5]')}  🔥 COMPLETO: Todo con Servers + Episodios`);
  console.log(`  ${cyan('[6]')}  🎬 Solo Películas (metadata + TMDB)`);
  console.log(`  ${cyan('[7]')}  📺 Solo Series (metadata + TMDB)`);
  console.log(`  ${cyan('[8]')}  🔴 Solo Animes (metadata + TMDB)`);
  console.log(`  ${cyan('[9]')}  🗑️  Borrar contenido la.movie de Firebase`);
  console.log(`  ${cyan('[10]')} ❌ Salir\n`);

  const choice = (await ask(`  Opción → `)).trim();
  if (choice === '10') { rl.close(); return; }

  if (choice === '9') {
    const conf = (await ask(`  ${red('⚠️  ¿Borrar TODO?')} (s/n) → `)).toLowerCase();
    if (conf === 's') await deleteBySource();
    rl.close(); return;
  }

  let skipExisting = false;
  const skipQ = await ask(`  ${yellow('¿Saltar ítems ya existentes?')} (s/n) → `);
  skipExisting = skipQ.toLowerCase() === 's';

  const totals = { uploaded: 0, errors: 0 };
  const add = r => { totals.uploaded += r?.uploaded || 0; totals.errors += r?.errors || 0; };

  try {
    switch (choice) {
      case '1':
        add(await scrapeMoviesMeta(skipExisting, true));
        add(await scrapeSeries('tvshows', 'Series', false, skipExisting, true));
        // add(await scrapeSeries('animes',  'Animes', false, skipExisting, true));
        break;
      case '2': add(await scrapeMoviesWithServers(skipExisting, true)); break;
      case '3': add(await scrapeSeries('tvshows', 'Series', true, skipExisting, true)); break;
      case '4': add(await scrapeSeries('animes', 'Animes', true, skipExisting, true)); break;
      case '5':
        add(await scrapeMoviesWithServers(skipExisting, true));
        add(await scrapeSeries('tvshows', 'Series', true, skipExisting, true));
        // add(await scrapeSeries('animes',  'Animes', true, skipExisting, true));
        break;
      case '6': add(await scrapeMoviesMeta(skipExisting, true)); break;
      case '7': add(await scrapeSeries('tvshows', 'Series', false, skipExisting, true)); break;
      case '8': add(await scrapeSeries('animes', 'Animes', false, skipExisting, true)); break;
      default: console.log(red('  Opción inválida.'));
    }

    console.log(`\n  ${green('🎉 ¡Finalizado!')} Total: ${green(totals.uploaded)} | Errores: ${totals.errors > 0 ? red(totals.errors) : green(0)}\n`);
  } catch (e) {
    console.error(red('\n❌ Error fatal:'), e.message);
  }

  rl.close();
}

main().catch(e => { console.error(red('\n❌ Error:'), e.message); process.exit(1); });

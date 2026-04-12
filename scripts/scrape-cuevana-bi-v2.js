#!/usr/bin/env node
/**
 * scrape-cuevana-bi-v2.js
 * Scraper masivo de cuevana.bi → Firebase
 * Scrapea películas, series (con temporadas/episodios) y anime.
 * Los servers se resuelven on-demand en la app (WebView + ad blocker).
 * Uso: node scripts/scrape-cuevana-bi-v2.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Colores ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', purple: '\x1b[35m', blue: '\x1b[34m',
};
const red    = s => `${c.red}${s}${c.reset}`;
const green  = s => `${c.green}${s}${c.reset}`;
const yellow = s => `${c.yellow}${s}${c.reset}`;
const cyan   = s => `${c.cyan}${s}${c.reset}`;
const bold   = s => `${c.bold}${s}${c.reset}`;
const dim    = s => `${c.dim}${s}${c.reset}`;
const blue   = s => `${c.blue}${s}${c.reset}`;

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

// ── Constantes ───────────────────────────────────────────────────────────────
const BASE_URL = 'https://cuevana.bi';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch con retry ──────────────────────────────────────────────────────────
async function fetchHTML(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-AR,es;q=0.9',
          'Referer': BASE_URL,
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        if (res.status === 403 || res.status === 503) {
          // Cloudflare block — esperar más
          await sleep(5000 * (i + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

// ── Parsear poster URL de TMDB ───────────────────────────────────────────────
function extractTmdbPoster(imgSrc) {
  if (!imgSrc) return '';
  // cuevana.bi usa: /_next/image?url=https%3A%2F%2Fwww.themoviedb.org%2Ft%2Fp%2Fw600_and_h900_bestv2%2Fpath.jpg&w=3840&q=75
  try {
    const decoded = decodeURIComponent(imgSrc);
    const match = decoded.match(/themoviedb\.org\/t\/p\/\w+\/([\w\d]+\.jpg)/);
    if (match) return `https://image.tmdb.org/t/p/w500/${match[1]}`;
    // Fallback: extraer cualquier URL de TMDB
    const tmdbMatch = decoded.match(/(https:\/\/image\.tmdb\.org[^\s&"]+)/);
    if (tmdbMatch) return tmdbMatch[1];
    const tmdbMatch2 = decoded.match(/(https:\/\/www\.themoviedb\.org\/t\/p\/[^\s&"]+)/);
    if (tmdbMatch2) return tmdbMatch2[1].replace('www.themoviedb.org/t/p/', 'image.tmdb.org/t/p/');
  } catch {}
  // Si viene directo de cuevana.bi, usarlo tal cual
  if (imgSrc.startsWith('http')) return imgSrc;
  if (imgSrc.startsWith('/')) return `${BASE_URL}${imgSrc}`;
  return '';
}

function extractTmdbBackdrop(ogImage) {
  if (!ogImage) return '';
  try {
    const decoded = decodeURIComponent(ogImage);
    const match = decoded.match(/themoviedb\.org\/t\/p\/\w+\/([\w\d]+\.jpg)/);
    if (match) return `https://image.tmdb.org/t/p/w1280/${match[1]}`;
    const tmdbMatch = decoded.match(/(https:\/\/image\.tmdb\.org[^\s&"]+)/);
    if (tmdbMatch) return tmdbMatch[1].replace('/w500/', '/w1280/').replace('/original/', '/w1280/');
  } catch {}
  if (ogImage.startsWith('http')) return ogImage;
  return '';
}

// ══════════════════════════════════════════════════════════════════════════════
// FASE 1: Recolectar slugs de los listados
// ══════════════════════════════════════════════════════════════════════════════
async function collectSlugs(type, label) {
  console.log(`\n  ${bold(`📋 Recolectando ${label}...`)}`);
  const urlBase = type === 'movies' ? `${BASE_URL}/peliculas` : `${BASE_URL}/series`;
  const slugs = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const url = page === 1 ? urlBase : `${urlBase}?page=${page}`;
    try {
      const html = await fetchHTML(url);
      const $ = cheerio.load(html);

      // Extraer todos los links a detalles
      const prefix = type === 'movies' ? '/pelicula/' : '/serie/';
      const links = $(`a[href*="${prefix}"]`);
      let found = 0;

      links.each((_, el) => {
        const href = $(el).attr('href') || '';
        // Extraer slug del href
        const slug = href.split(prefix).pop()?.split('?')[0]?.split('#')[0];
        if (slug && !slug.includes('/') && !slugs.includes(slug)) {
          const title = $(el).find('p').first().text().trim();
          const year = $(el).find('span').first().text().trim();
          const img = $(el).find('img').attr('src') || '';
          slugs.push({ slug, title, year, poster: extractTmdbPoster(img) });
          found++;
        }
      });

      if (found === 0) {
        hasNext = false;
        break;
      }

      // Verificar si hay página siguiente
      const nextLink = $('a[href*="page="]').filter((_, el) => {
        return $(el).text().includes('Siguiente') || $(el).text().includes('Next');
      });
      hasNext = nextLink.length > 0;

      // Progreso
      process.stdout.write(`\r  ${cyan(`Pág ${page}`)} — ${green(`${slugs.length} slugs`)}     `);
      page++;
      await sleep(300); // Rate limiting
    } catch (e) {
      if (e.message?.includes('403') || e.message?.includes('503')) {
        console.log(`\n  ${yellow(`⚠️  Cloudflare en pág ${page} — esperando 10s...`)}`);
        await sleep(10000);
        continue;
      }
      console.log(`\n  ${red(`❌ Error pág ${page}:`)} ${e.message}`);
      hasNext = false;
    }
  }

  console.log(`\n  ${green(`✅ ${slugs.length} ${label} recolectados`)}`);
  return slugs;
}

// ══════════════════════════════════════════════════════════════════════════════
// FASE 2: Extraer metadata de páginas de detalle
// ══════════════════════════════════════════════════════════════════════════════
async function fetchMovieDetail(slug) {
  const url = `${BASE_URL}/pelicula/${slug}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  // Título y año — "Película Scream 7 (2026)"
  const h1 = $('h1').first().text().trim();
  const titleMatch = h1.match(/^(?:Película\s+)?(.+?)(?:\s*\((\d{4})\))?$/);
  const title = titleMatch?.[1]?.trim() || h1;
  const year = titleMatch?.[2] || '';

  // Sinopsis
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  let description = '';
  // Intentar obtener sinopsis del body text
  const bodyText = $('body').text();
  const sinopsisMatch = bodyText.match(/(?:Sinopsis|sinopsis)\s*\n?\s*([\s\S]*?)(?=\nElenco|\nGénero|\nQué más|$)/);
  if (sinopsisMatch) {
    description = sinopsisMatch[1].trim();
  }
  if (!description) {
    // Fallback al og:description — suele tener "Title | descripción"
    description = ogDesc.split('|').slice(1).join('|').trim() || ogDesc;
  }

  // Duración
  const durMatch = bodyText.match(/Duración:\s*(\d+h\s*\d+m|\d+\s*min)/);
  const duration = durMatch?.[1] || '';

  // Géneros
  const genres = [];
  $('a[href*="genero="]').each((_, el) => {
    genres.push($(el).text().trim());
  });

  // Elenco
  let cast = '';
  const castMatch = bodyText.match(/Elenco\s*\n\s*([\s\S]*?)(?=\nGénero|\nQué más|$)/);
  if (castMatch) cast = castMatch[1].trim();

  // Poster
  const poster = extractTmdbPoster($('img').first().attr('src') || '');

  // Backdrop (og:image)
  const backdrop = extractTmdbBackdrop($('meta[property="og:image"]').attr('content') || '');

  return { title, year, description, duration, genres, cast, poster, backdrop };
}

async function fetchSeriesDetail(slug) {
  const url = `${BASE_URL}/serie/${slug}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  // Título — "The Last of Us (2023)"
  const h1 = $('h1').first().text().trim();
  const titleMatch = h1.match(/^(.+?)(?:\s*\((\d{4})\))?$/);
  const title = titleMatch?.[1]?.trim() || h1;
  const year = titleMatch?.[2] || '';

  // Sinopsis
  const bodyText = $('body').text();
  let description = '';
  const sinopsisMatch = bodyText.match(/Sinopsis\s*\n?\s*([\s\S]*?)(?=\nElenco|\nGénero|$)/);
  if (sinopsisMatch) description = sinopsisMatch[1].trim();
  if (!description) {
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    description = ogDesc.split('|').slice(1).join('|').trim() || ogDesc;
  }

  // Géneros
  const genres = [];
  $('a[href*="genero="]').each((_, el) => {
    genres.push($(el).text().trim());
  });

  // Elenco
  let cast = '';
  const castMatch = bodyText.match(/Elenco\s*\n\s*([\s\S]*?)(?=\nGénero|\nQué más|$)/);
  if (castMatch) cast = castMatch[1].trim();

  // Poster y backdrop
  const poster = extractTmdbPoster($('img').first().attr('src') || '');
  const backdrop = extractTmdbBackdrop($('meta[property="og:image"]').attr('content') || '');

  // Temporadas
  const seasons = [];
  $('a[href*="temporada-"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const num = parseInt(href.match(/temporada-(\d+)/)?.[1] || '0');
    if (num > 0 && !seasons.find(s => s.season === num)) {
      seasons.push({ season: num, href });
    }
  });
  seasons.sort((a, b) => a.season - b.season);

  return { title, year, description, genres, cast, poster, backdrop, seasons };
}

async function fetchSeasonEpisodes(seriesSlug, seasonNum) {
  const url = `${BASE_URL}/serie/${seriesSlug}/temporada-${seasonNum}`;
  try {
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const episodes = [];
    $('a[href*="episodio-"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      // Match both formats: episodio-1x1 or temporada-1/episodio-1
      const epMatch = href.match(/episodio-(\d+)(?:x(\d+))?/);
      if (epMatch) {
        const epNum = epMatch[2] ? parseInt(epMatch[2]) : parseInt(epMatch[1]);
        if (!episodes.includes(epNum)) episodes.push(epNum);
      }
    });
    return episodes.length;
  } catch {
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FASE 3: Subir a Firebase
// ══════════════════════════════════════════════════════════════════════════════
async function uploadBatch(batch) {
  const fb = db.batch();
  for (const item of batch) {
    fb.set(db.collection('content').doc(item.id), item, { merge: true });
  }
  await fb.commit();
}

// ── Determinar si es anime por género ────────────────────────────────────────
const ANIME_GENRES = ['animación', 'animacion', 'animation', 'anime'];
function isAnime(genres) {
  return genres.some(g => ANIME_GENRES.includes(g.toLowerCase()));
}

// ══════════════════════════════════════════════════════════════════════════════
// SCRAPE MOVIES
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeMovies(skipExisting = false) {
  const slugs = await collectSlugs('movies', 'Películas');
  if (!slugs.length) return { uploaded: 0, errors: 0 };

  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    const snap = await db.collection('content').select().get();
    snap.forEach(doc => existingIds.add(doc.id));
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  console.log(`\n  ${bold(`📥 Obteniendo metadata de ${slugs.length} películas...`)}`);
  let uploaded = 0, errors = 0, skipped = 0;
  const startTime = Date.now();
  const batch = [];

  for (let i = 0; i < slugs.length; i++) {
    const { slug, title: listTitle, year: listYear, poster: listPoster } = slugs[i];
    const docId = `movie_${slug}`;

    if (skipExisting && existingIds.has(docId)) {
      skipped++;
      continue;
    }

    try {
      // Fetch detalle completo
      const detail = await fetchMovieDetail(slug);
      const type = isAnime(detail.genres) ? 'anime' : 'movie';

      const item = {
        id: docId,
        slug,
        type,
        title: detail.title || listTitle || 'Sin título',
        year: detail.year || listYear || '',
        genre: detail.genres[0] || 'Varios',
        genres: detail.genres,
        poster: detail.poster || listPoster || '',
        backdrop: detail.backdrop || '',
        description: detail.description || '',
        duration: detail.duration || '',
        cast: detail.cast || '',
        rating: '',
        source: 'cuevana-bi',
        videoUrl: `${BASE_URL}/pelicula/${slug}`,
        servers: [],
        updatedAt: Date.now(),
      };

      batch.push(item);

      // Upload en lotes de 400
      if (batch.length >= 400) {
        await uploadBatch(batch);
        uploaded += batch.length;
        batch.length = 0;
      }

      // Progreso
      const pct = (((i + 1) / slugs.length) * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = Math.ceil((slugs.length - i - 1) / rate);
      const eta = `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
      process.stdout.write(`\r  ${pct}% (${i + 1}/${slugs.length}) Sub: ${uploaded + batch.length} Skip: ${skipped} Err: ${errors} ETA: ${eta}    `);

      await sleep(200); // Rate limit
    } catch (e) {
      errors++;
      await sleep(1000);
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    await uploadBatch(batch);
    uploaded += batch.length;
    batch.length = 0;
  }

  console.log(`\n  ${green(`✅ Películas: ${uploaded} subidos, ${skipped} skip, ${errors} errores`)}`);
  return { uploaded, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCRAPE SERIES (con temporadas y episodios)
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeSeries(skipExisting = false) {
  const slugs = await collectSlugs('series', 'Series');
  if (!slugs.length) return { uploaded: 0, errors: 0 };

  let existingIds = new Set();
  if (skipExisting) {
    process.stdout.write(`  ${cyan('Cargando IDs existentes...')}`);
    const snap = await db.collection('content').select().get();
    snap.forEach(doc => existingIds.add(doc.id));
    console.log(` ${green(existingIds.size)} encontrados.`);
  }

  console.log(`\n  ${bold(`📥 Obteniendo metadata de ${slugs.length} series...`)}`);
  let uploaded = 0, errors = 0, skipped = 0;
  const startTime = Date.now();
  const batch = [];

  for (let i = 0; i < slugs.length; i++) {
    const { slug, title: listTitle, year: listYear, poster: listPoster } = slugs[i];
    const docId = `series_${slug}`;

    if (skipExisting && existingIds.has(docId)) {
      skipped++;
      continue;
    }

    try {
      const detail = await fetchSeriesDetail(slug);
      const type = isAnime(detail.genres) ? 'anime' : 'series';

      // Obtener episodios de cada temporada
      const seasonsData = [];
      for (const s of detail.seasons) {
        const epCount = await fetchSeasonEpisodes(slug, s.season);
        seasonsData.push({ season: s.season, episodes: epCount || 1 });
        await sleep(200);
      }

      const item = {
        id: docId,
        slug,
        type,
        title: detail.title || listTitle || 'Sin título',
        year: detail.year || listYear || '',
        genre: detail.genres[0] || 'Varios',
        genres: detail.genres,
        poster: detail.poster || listPoster || '',
        backdrop: detail.backdrop || '',
        description: detail.description || '',
        cast: detail.cast || '',
        rating: '',
        source: 'cuevana-bi',
        seasonsData,
        episodeLinks: {},
        updatedAt: Date.now(),
      };

      batch.push(item);

      if (batch.length >= 400) {
        await uploadBatch(batch);
        uploaded += batch.length;
        batch.length = 0;
      }

      const pct = (((i + 1) / slugs.length) * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = Math.ceil((slugs.length - i - 1) / rate);
      const eta = `${Math.floor(remaining / 60)}m ${remaining % 60}s`;
      process.stdout.write(`\r  ${pct}% (${i + 1}/${slugs.length}) Sub: ${uploaded + batch.length} Skip: ${skipped} Err: ${errors} ETA: ${eta}    `);

      await sleep(300);
    } catch (e) {
      errors++;
      await sleep(1000);
    }
  }

  if (batch.length > 0) {
    await uploadBatch(batch);
    uploaded += batch.length;
    batch.length = 0;
  }

  console.log(`\n  ${green(`✅ Series: ${uploaded} subidos, ${skipped} skip, ${errors} errores`)}`);
  return { uploaded, errors };
}

// ══════════════════════════════════════════════════════════════════════════════
// DELETE ALL CONTENT
// ══════════════════════════════════════════════════════════════════════════════
async function deleteAllContent() {
  console.log(`\n  ${red('🗑️  Borrando TODO el contenido...')}`);
  const snap = await db.collection('content').select().get();
  const total = snap.size;
  if (total === 0) {
    console.log(`  ${yellow('No hay documentos para borrar.')}`);
    return;
  }

  let deleted = 0;
  const batchSize = 400;
  const docs = snap.docs;

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const fb = db.batch();
    chunk.forEach(doc => fb.delete(doc.ref));
    await fb.commit();
    deleted += chunk.length;
    process.stdout.write(`\r  ${red(`Borrados: ${deleted}/${total}`)}    `);
  }

  console.log(`\n  ${green(`✅ ${deleted} documentos eliminados.`)}`);
}

async function deleteCuevanaBiContent() {
  console.log(`\n  ${red('🗑️  Borrando contenido de cuevana-bi...')}`);
  const snap = await db.collection('content').where('source', '==', 'cuevana-bi').select().get();
  const total = snap.size;
  if (total === 0) {
    console.log(`  ${yellow('No hay documentos de cuevana-bi.')}`);
    return;
  }

  let deleted = 0;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const chunk = docs.slice(i, i + 400);
    const fb = db.batch();
    chunk.forEach(doc => fb.delete(doc.ref));
    await fb.commit();
    deleted += chunk.length;
    process.stdout.write(`\r  ${red(`Borrados: ${deleted}/${total}`)}    `);
  }
  console.log(`\n  ${green(`✅ ${deleted} documentos eliminados.`)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// MENÚ PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(res => rl.question(q, res));

async function main() {
  console.clear();
  console.log(`\n${c.purple}${c.bold}  ╔═══════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  📺  SCRAPER CUEVANA.BI v2  →  FIREBASE               ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╠═══════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  Metadata: cuevana.bi HTML · Servers: on-demand (app)  ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ║  Incluye: películas, series, temporadas, episodios     ║${c.reset}`);
  console.log(`${c.purple}${c.bold}  ╚═══════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`  ${bold('Opciones:')}`);
  console.log(`  [1] 🎯  Scrapear TODO (películas + series)`);
  console.log(`  [2] 🎬  Solo Películas`);
  console.log(`  [3] 📺  Solo Series (con temporadas/episodios)`);
  console.log(`  [4] 🗑️   Borrar TODO el contenido de Firebase`);
  console.log(`  [5] 🗑️   Borrar solo contenido de cuevana-bi`);
  console.log(`  [6] 🔄  FLUJO COMPLETO: borrar todo → scrapear todo`);
  console.log(`  [7] ❌  Salir\n`);

  const choice = (await ask(`  Opción → `)).trim();
  if (choice === '7') { rl.close(); return; }

  if (choice === '4') {
    const confirm = (await ask(`  ${red('⚠️  ¿Borrar TODO el contenido? Esto es irreversible.')} (s/n) → `)).toLowerCase();
    if (confirm === 's') await deleteAllContent();
    rl.close(); return;
  }
  if (choice === '5') {
    await deleteCuevanaBiContent();
    rl.close(); return;
  }

  let skipExisting = false;
  if (['1', '2', '3'].includes(choice)) {
    const skipQ = await ask(`  ${yellow('¿Saltar ítems ya existentes?')} (s/n) → `);
    skipExisting = skipQ.toLowerCase() === 's';
  }

  if (choice === '6') {
    console.log(`\n  ${bold('📋 FLUJO COMPLETO:')}`);
    console.log(`  1. Borrar TODO el contenido`);
    console.log(`  2. Scrapear películas y series de cuevana.bi\n`);
    const confirm = (await ask(`  ${yellow('¿Confirmar?')} (s/n) → `)).toLowerCase();
    if (confirm !== 's') { rl.close(); return; }
    await deleteAllContent();
  }

  const totals = { uploaded: 0, errors: 0 };
  const add = r => { totals.uploaded += r.uploaded; totals.errors += r.errors; };

  if (['1', '6'].includes(choice)) {
    add(await scrapeMovies(skipExisting));
    add(await scrapeSeries(skipExisting));
  } else if (choice === '2') {
    add(await scrapeMovies(skipExisting));
  } else if (choice === '3') {
    add(await scrapeSeries(skipExisting));
  }

  console.log(`\n  ${green('🎉 ¡Finalizado!')} Total subidos: ${green(totals.uploaded)} | Errores: ${totals.errors > 0 ? red(totals.errors) : green(0)}\n`);
  rl.close();
}

main().catch(e => { console.error(red('\n❌ Error:'), e.message); process.exit(1); });

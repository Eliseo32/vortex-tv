/**
 * ChocopopService.ts
 * Obtiene canales de ChocoPop TV con 3 niveles de fallback:
 *
 * 1. Firestore → colección "chocopopChannels" (poblada por GitHub Actions cada 6h)
 * 2. Scraping directo de http://tv.chocopopflow.com/?m=0 (extrae var Streams)
 * 3. Lista hardcodeada con el último token conocido
 *
 * El scraping directo YA FUNCIONA desde la app (58 canales confirmados)
 */

import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface ChocopopChannel {
  id: string;
  name: string;
  m3u8: string;
  url: string;
  poster?: string | null;
  order: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const SOURCE_URL = 'http://tv.chocopopflow.com/?m=0';
const LAST_KNOWN_TOKEN = 'a8a0dc318cc5a076f84bea2206893142';
const RELAY_BASE = `http://201.217.246.42:44310/Live/${LAST_KNOWN_TOKEN}`;

// Lista hardcodeada de emergencia
const FALLBACK_CHANNELS: ChocopopChannel[] = [
  { id: 'local-17',  name: 'América TV',        m3u8: 'local-17',   url: `${RELAY_BASE}/local-17.playlist.m3u8`,   order: 0  },
  { id: 'telefe',    name: 'Telefe',             m3u8: 'telefe',     url: `${RELAY_BASE}/telefe.playlist.m3u8`,     order: 1  },
  { id: 'eltrece',   name: 'El Trece',           m3u8: 'eltrece',    url: `${RELAY_BASE}/eltrece.playlist.m3u8`,    order: 2  },
  { id: 'elnueve',   name: 'El Nueve',           m3u8: 'elnueve',    url: `${RELAY_BASE}/elnueve.playlist.m3u8`,    order: 3  },
  { id: 'local-19',  name: 'Net TV',             m3u8: 'local-19',   url: `${RELAY_BASE}/local-19.playlist.m3u8`,   order: 4  },
  { id: 'local-107', name: 'TN',                 m3u8: 'local-107',  url: `${RELAY_BASE}/local-107.playlist.m3u8`,  order: 5  },
  { id: 'local-110', name: 'C5N',                m3u8: 'local-110',  url: `${RELAY_BASE}/local-110.playlist.m3u8`,  order: 6  },
  { id: 'local-111', name: 'A24',                m3u8: 'local-111',  url: `${RELAY_BASE}/local-111.playlist.m3u8`,  order: 7  },
  { id: 'local-122', name: 'Infobae TV',         m3u8: 'local-122',  url: `${RELAY_BASE}/local-122.playlist.m3u8`,  order: 8  },
  { id: 'local-90',  name: 'TyC Sports',         m3u8: 'local-90',   url: `${RELAY_BASE}/local-90.playlist.m3u8`,   order: 9  },
  { id: 'local-90-2',name: 'TyC Sports 2',       m3u8: 'local-90-2', url: `${RELAY_BASE}/local-90-2.playlist.m3u8`, order: 10 },
  { id: 'local-94',  name: 'ESPN',               m3u8: 'local-94',   url: `${RELAY_BASE}/local-94.playlist.m3u8`,   order: 11 },
  { id: 'local-95',  name: 'ESPN 2',             m3u8: 'local-95',   url: `${RELAY_BASE}/local-95.playlist.m3u8`,   order: 12 },
  { id: 'local-96',  name: 'ESPN 3',             m3u8: 'local-96',   url: `${RELAY_BASE}/local-96.playlist.m3u8`,   order: 13 },
  { id: 'local-97',  name: 'Fox Sports',         m3u8: 'local-97',   url: `${RELAY_BASE}/local-97.playlist.m3u8`,   order: 14 },
  { id: 'local-98',  name: 'Fox Sports 2',       m3u8: 'local-98',   url: `${RELAY_BASE}/local-98.playlist.m3u8`,   order: 15 },
  { id: 'local-102', name: 'HBO',                m3u8: 'local-102',  url: `${RELAY_BASE}/local-102.playlist.m3u8`,  order: 16 },
  { id: 'local-103', name: 'HBO 2',              m3u8: 'local-103',  url: `${RELAY_BASE}/local-103.playlist.m3u8`,  order: 17 },
  { id: 'local-68',  name: 'Star Channel',       m3u8: 'local-68',   url: `${RELAY_BASE}/local-68.playlist.m3u8`,   order: 18 },
  { id: 'local-32',  name: 'Disney Channel',     m3u8: 'local-32',   url: `${RELAY_BASE}/local-32.playlist.m3u8`,   order: 19 },
  { id: 'local-33',  name: 'Disney Junior',      m3u8: 'local-33',   url: `${RELAY_BASE}/local-33.playlist.m3u8`,   order: 20 },
  { id: 'local-34',  name: 'Cartoon Network',    m3u8: 'local-34',   url: `${RELAY_BASE}/local-34.playlist.m3u8`,   order: 21 },
  { id: 'local-35',  name: 'Nickelodeon',        m3u8: 'local-35',   url: `${RELAY_BASE}/local-35.playlist.m3u8`,   order: 22 },
  { id: 'local-40',  name: 'Sony Channel',       m3u8: 'local-40',   url: `${RELAY_BASE}/local-40.playlist.m3u8`,   order: 23 },
  { id: 'local-41',  name: 'AXN',                m3u8: 'local-41',   url: `${RELAY_BASE}/local-41.playlist.m3u8`,   order: 24 },
  { id: 'local-42',  name: 'AMC',                m3u8: 'local-42',   url: `${RELAY_BASE}/local-42.playlist.m3u8`,   order: 25 },
  { id: 'local-43',  name: 'Warner Channel',     m3u8: 'local-43',   url: `${RELAY_BASE}/local-43.playlist.m3u8`,   order: 26 },
  { id: 'local-44',  name: 'Universal',          m3u8: 'local-44',   url: `${RELAY_BASE}/local-44.playlist.m3u8`,   order: 27 },
  { id: 'local-45',  name: 'Paramount',          m3u8: 'local-45',   url: `${RELAY_BASE}/local-45.playlist.m3u8`,   order: 28 },
  { id: 'local-51',  name: 'Discovery CH',       m3u8: 'local-51',   url: `${RELAY_BASE}/local-51.playlist.m3u8`,   order: 29 },
  { id: 'local-52',  name: 'National Geo',       m3u8: 'local-52',   url: `${RELAY_BASE}/local-52.playlist.m3u8`,   order: 30 },
  { id: 'local-53',  name: 'History',            m3u8: 'local-53',   url: `${RELAY_BASE}/local-53.playlist.m3u8`,   order: 31 },
  { id: 'local-115', name: 'CNN en Español',     m3u8: 'local-115',  url: `${RELAY_BASE}/local-115.playlist.m3u8`,  order: 32 },
  { id: 'local-117', name: 'BBC World',          m3u8: 'local-117',  url: `${RELAY_BASE}/local-117.playlist.m3u8`,  order: 33 },
  { id: 'local-119', name: 'Crónica TV',         m3u8: 'local-119',  url: `${RELAY_BASE}/local-119.playlist.m3u8`,  order: 34 },
];

// ─── Logos conocidos (cuando el scraper no devuelve poster) ───────────────────
// Se usan logos de dominio público / CDNs de alta disponibilidad
const CHANNEL_LOGOS: Record<string, string> = {
  // Canales Argentina
  'local-17':   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/America_TV_logo.png/320px-America_TV_logo.png',
  'telefe':      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Telefe_2020.svg/320px-Telefe_2020.svg.png',
  'eltrece':     'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/El_Trece_TV_Argentina.svg/280px-El_Trece_TV_Argentina.svg.png',
  'elnueve':     'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/El_Nueve_logo.svg/280px-El_Nueve_logo.svg.png',
  'local-19':    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/NET_TV_LOGO.png/280px-NET_TV_LOGO.png',
  // Noticias Argentina
  'local-107':   'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/TN_-_Todo_Noticias_%28logo%29.svg/280px-TN_-_Todo_Noticias_%28logo%29.svg.png',
  'local-110':   'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/C5N_logo.svg/280px-C5N_logo.svg.png',
  'local-111':   'https://upload.wikimedia.org/wikipedia/commons/thumb/a/aa/A24_Argentina_logo.svg/280px-A24_Argentina_logo.svg.png',
  'local-122':   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Infobae_TV.png/280px-Infobae_TV.png',
  'local-119':   'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Cr%C3%B3nica_TV_-_logo_2020.svg/280px-Cr%C3%B3nica_TV_-_logo_2020.svg.png',
  'local-115':   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/CNN_enEspa%C3%B1ol.png/280px-CNN_enEspa%C3%B1ol.png',
  'local-117':   'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/BBC_World_News_2022_%28Alt%29.svg/280px-BBC_World_News_2022_%28Alt%29.svg.png',
  // Deportes
  'local-90':    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/TyC_Sports_logo.svg/280px-TyC_Sports_logo.svg.png',
  'local-90-2':  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/TyC_Sports_logo.svg/280px-TyC_Sports_logo.svg.png',
  'local-94':    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/ESPN_wordmark.svg/280px-ESPN_wordmark.svg.png',
  'local-95':    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/ESPN_wordmark.svg/280px-ESPN_wordmark.svg.png',
  'local-96':    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/ESPN_wordmark.svg/280px-ESPN_wordmark.svg.png',
  'local-97':    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Fox_Sports_Asia.png/280px-Fox_Sports_Asia.png',
  'local-98':    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Fox_Sports_Asia.png/280px-Fox_Sports_Asia.png',
  // Entretenimiento
  'local-102':   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/HBO_logo.svg/280px-HBO_logo.svg.png',
  'local-103':   'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/HBO_logo.svg/280px-HBO_logo.svg.png',
  'local-68':    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Star_Channel_logo.svg/280px-Star_Channel_logo.svg.png',
  'local-32':    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Disney_Channel_2019.svg/280px-Disney_Channel_2019.svg.png',
  'local-33':    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Disney_Junior_Logo.svg/280px-Disney_Junior_Logo.svg.png',
  'local-34':    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Cartoon_network_2010_logo.svg/280px-cartoon_network_2010_logo.svg.png',
  'local-35':    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Nickelodeon_2009_logo_%28production_bug%29.svg/280px-Nickelodeon_2009_logo_%28production_bug%29.svg.png',
  'local-40':    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Sony_Channel_2018.svg/280px-Sony_Channel_2018.svg.png',
  'local-41':    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/AXN_TV_logo_2014.svg/280px-AXN_TV_logo_2014.svg.png',
  'local-42':    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/AMC-Logo.svg/280px-AMC-Logo.svg.png',
  'local-43':    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Warner_Channel_Logo.svg/280px-Warner_Channel_Logo.svg.png',
  'local-44':    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/NBCUniversal_logo.svg/280px-NBCUniversal_logo.svg.png',
  'local-45':    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Paramount_Channel.svg/280px-Paramount_Channel.svg.png',
  'local-51':    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Discovery_Channel_logo.svg/280px-Discovery_Channel_logo.svg.png',
  'local-52':    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/National_Geographic_Channel_new_logo.svg/280px-National_Geographic_Channel_new_logo.svg.png',
  'local-53':    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/History_Logo.svg/280px-History_Logo.svg.png',
};

/** Dado un canal del scraper, retorna la URL de logo más apropiada.
 * Prioridad: logos Wikipedia (conocidos, siempre disponibles) > poster del scraper
 */
function resolveChannelLogo(channel: { m3u8?: string | null; name?: string | null; poster?: string | null }): string | null {
  // 1. Buscar por ID (m3u8) — Wikipedia logos son los más confiables en Android TV
  if (channel.m3u8 && CHANNEL_LOGOS[channel.m3u8]) return CHANNEL_LOGOS[channel.m3u8];
  // 2. Buscar por fragmento de nombre
  if (channel.name) {
    const nameL = channel.name.toLowerCase();
    const nameMap: Record<string, string> = {
      'america tv':     CHANNEL_LOGOS['local-17'],
      'telefe':         CHANNEL_LOGOS['telefe'],
      'trece':          CHANNEL_LOGOS['eltrece'],
      'nueve':          CHANNEL_LOGOS['elnueve'],
      'net tv':         CHANNEL_LOGOS['local-19'],
      'tn ':            CHANNEL_LOGOS['local-107'],
      'c5n':            CHANNEL_LOGOS['local-110'],
      'a24':            CHANNEL_LOGOS['local-111'],
      'infobae':        CHANNEL_LOGOS['local-122'],
      'cronica':        CHANNEL_LOGOS['local-119'],
      'crónica':        CHANNEL_LOGOS['local-119'],
      'cnn':            CHANNEL_LOGOS['local-115'],
      'bbc':            CHANNEL_LOGOS['local-117'],
      'tyc sports 2':   CHANNEL_LOGOS['local-90-2'],
      'tyc sports':     CHANNEL_LOGOS['local-90'],
      'espn 2':         CHANNEL_LOGOS['local-95'],
      'espn 3':         CHANNEL_LOGOS['local-96'],
      'espn':           CHANNEL_LOGOS['local-94'],
      'fox sports 2':   CHANNEL_LOGOS['local-98'],
      'fox sports':     CHANNEL_LOGOS['local-97'],
      'hbo 2':          CHANNEL_LOGOS['local-103'],
      'hbo':            CHANNEL_LOGOS['local-102'],
      'star channel':   CHANNEL_LOGOS['local-68'],
      'disney channel': CHANNEL_LOGOS['local-32'],
      'disney junior':  CHANNEL_LOGOS['local-33'],
      'cartoon':        CHANNEL_LOGOS['local-34'],
      'nickelodeon':    CHANNEL_LOGOS['local-35'],
      'sony':           CHANNEL_LOGOS['local-40'],
      'axn':            CHANNEL_LOGOS['local-41'],
      'amc':            CHANNEL_LOGOS['local-42'],
      'warner':         CHANNEL_LOGOS['local-43'],
      'universal':      CHANNEL_LOGOS['local-44'],
      'paramount':      CHANNEL_LOGOS['local-45'],
      'discovery':      CHANNEL_LOGOS['local-51'],
      'national geo':   CHANNEL_LOGOS['local-52'],
      'natgeo':         CHANNEL_LOGOS['local-52'],
      'history':        CHANNEL_LOGOS['local-53'],
    };
    for (const [fragment, url] of Object.entries(nameMap)) {
      if (url && nameL.includes(fragment)) return url;
    }
  }
  // 3. Usar el poster del scraper como fallback (puede fallar en Android TV por CORS)
  if (channel.poster && channel.poster.startsWith('http')) return channel.poster;
  return null;
}


// ─── Caché en memoria ─────────────────────────────────────────────────────────
let memCache: ChocopopChannel[] | null = null;

// ─── Nivel 1: Leer desde Firestore ───────────────────────────────────────────
async function fromFirestore(): Promise<ChocopopChannel[] | null> {
  try {
    const snap = await getDocs(
      query(collection(db, 'chocopopChannels'), orderBy('order', 'asc'))
    );
    if (!snap.empty) {
      const channels: ChocopopChannel[] = [];
      snap.forEach((d) => {
        const ch = d.data() as ChocopopChannel;
        // Enriquecer con logo si no tiene poster
        channels.push({ ...ch, poster: resolveChannelLogo(ch) });
      });
      console.log(`[ChocopopService] ✅ ${channels.length} canales desde Firestore`);
      return channels;
    }
    console.log('[ChocopopService] Firestore vacío (scraper aún no corrió)');
    return null;
  } catch (err: any) {
    // Permissions error es esperado hasta que el scraper pueble la colección
    console.log('[ChocopopService] Firestore no disponible:', err?.code || err?.message);
    return null;
  }
}

// ─── Extrae el bloque completo de Streams contando brackets ──────────────────
function extractStreamsBlock(html: string): string | null {
  const startPatterns = [/var\s+Streams\s*=\s*\[/, /Streams\s*=\s*\[/];
  for (const pattern of startPatterns) {
    const startMatch = html.match(pattern);
    if (!startMatch || startMatch.index === undefined) continue;
    const openIdx = startMatch.index + startMatch[0].length - 1;
    let depth = 0, inString = false, strChar = '', escaped = false;
    for (let i = openIdx; i < html.length; i++) {
      const c = html[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && inString) { escaped = true; continue; }
      if (!inString && (c === '"' || c === "'")) { inString = true; strChar = c; }
      else if (inString && c === strChar) { inString = false; }
      else if (!inString) {
        if (c === '[' || c === '{') depth++;
        else if (c === ']' || c === '}') { depth--; if (depth === 0) return html.slice(openIdx, i + 1); }
      }
    }
  }
  return null;
}

// ─── Nivel 2: Scraping directo del sitio ─────────────────────────────────────
async function fromScraping(): Promise<ChocopopChannel[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch(SOURCE_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; TV) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) return null;
    const html = await resp.text();

    // Usar el extractor por conteo de brackets (más robusto que regex)
    const rawBlock = extractStreamsBlock(html);
    if (!rawBlock) {
      console.warn('[ChocopopService] No se encontró var Streams');
      return null;
    }

    let raw: any[] | null = null;

    // Intento 1: JSON.parse
    try { raw = JSON.parse(rawBlock); } catch (_) {}

    // Intento 2: sanitizar trailing commas
    if (!raw) {
      try {
        const sanitized = rawBlock
          .replace(/\/\/[^\n]*/g, '')
          .replace(/,\s*([\]}])/g, '$1')
          .trim();
        raw = JSON.parse(sanitized);
      } catch (_) {}
    }

    // Intento 3: Function eval
    if (!raw) {
      try { raw = new Function(`"use strict"; return (${rawBlock})`)() as any[]; } catch (_) {}
    }

    if (!Array.isArray(raw) || raw.length === 0) return null;

    const channels: ChocopopChannel[] = raw
      .filter((ch) => ch.name && ch.url)
      .map((ch, index) => ({
        id: ch.m3u8 || `ch-${index}`,
        name: ch.name.trim(),
        m3u8: ch.m3u8 || `ch-${index}`,
        url: ch.url.trim(),
        poster: resolveChannelLogo({ m3u8: ch.m3u8, name: ch.name, poster: ch.poster }),
        order: index,
      }));

    console.log(`[ChocopopService] ✅ Scraped ${channels.length} canales desde el sitio`);
    return channels;
  } catch (err) {
    console.warn('[ChocopopService] Error en scraping:', err);
    return null;
  }
}

// ─── API Pública ──────────────────────────────────────────────────────────────
export const ChocopopService = {

  async fetchChannels(): Promise<ChocopopChannel[]> {
    // Caché en memoria
    if (memCache && memCache.length > 0) return memCache;

    // Nivel 1: Firestore (GitHub Actions → actualizado cada 6h)
    const fromDB = await fromFirestore();
    if (fromDB && fromDB.length > 0) {
      memCache = fromDB;
      return fromDB;
    }

    // Nivel 2: Scraping directo (confirmado funcional: 58 canales)
    const scraped = await fromScraping();
    if (scraped && scraped.length > 0) {
      memCache = scraped;
      return scraped;
    }

    // Nivel 3: Hardcoded
    console.warn('[ChocopopService] ⚠️ Usando lista hardcodeada');
    memCache = FALLBACK_CHANNELS;
    return FALLBACK_CHANNELS;
  },

  async fetchPreview(n = 12): Promise<ChocopopChannel[]> {
    const all = await this.fetchChannels();
    return all.slice(0, n);
  },

  clearCache() {
    memCache = null;
  },
};

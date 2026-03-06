import puppeteer from 'puppeteer';
import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

/**
 * Scraper for la.movie
 * 
 * Uso: node scripts/scrape-movies.js "https://la.movie/peliculas/"
 */

async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight - window.innerHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

async function scrapeMovieLinks(page, url) {
    console.log(`[1/3] Navegando a la lista: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log(`[2/3] Haciendo scroll para cargar todo...`);
    // await autoScroll(page); // Descomenta esto para raspar TODO el catálogo

    console.log(`[3/3] Esperando renderizado Javascript y extrayendo enlaces...`);
    await new Promise(r => setTimeout(r, 6000)); // Esperar más vital para SPAs

    const movieLinks = await page.evaluate(() => {
        // Busca cualquier enlace que contenga la URL
        const cards = Array.from(document.querySelectorAll('a[href*="/peliculas/"], a[href*="/series/"]'));
        return cards.map(card => card.href).filter((value, index, self) => self.indexOf(value) === index);
    });

    return movieLinks;
}

async function scrapeMovieDetails(page, url) {
    try {
        console.log(`\n⏳ Procesando: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Extraer Metadatos
        const metadata = await page.evaluate((currentUrl) => {
            const title = document.querySelector('h1')?.innerText || '';

            let year = currentUrl.match(/-(\d{4})$/)?.[1] || currentUrl.match(/-(\d{4})-/)?.[1];
            if (!year) {
                const spans = Array.from(document.querySelectorAll('span, p, div'));
                const yearStr = spans.find(s => /\b(19|20)\d{2}\b/.test(s.innerText))?.innerText || '';
                year = yearStr.match(/\b(19|20)\d{2}\b/)?.[0] || new Date().getFullYear().toString();
            }

            // La sinopsis suele estar en un div/p, busquemos p que superen cierto largo
            const pTags = Array.from(document.querySelectorAll('p'));
            const descTag = pTags.find(p => p.innerText.length > 50);
            const description = descTag ? descTag.innerText : 'No hay sinopsis disponible.';

            // Poster de fondo (busca img)
            let poster = '';
            const img = document.querySelector('img[src*="tmdb.org/t/p/"]');
            if (img) {
                poster = img.src;
            }

            return {
                title,
                description,
                year,
                poster,
                type: currentUrl.includes('/series/') ? 'series' : 'movie',
                genre: currentUrl.includes('/series/') ? 'Series' : 'Películas',
                rating: '',
                servers: []
            };
        }, url);

        console.log(`   🎬 Título: ${metadata.title} (${metadata.year})`);

        // Intentar sacar los Iframes haciendo clic en Play. la.movie usa un div overlay central
        const playButtonSelectors = [
            '.playp', // Obtenido desde el subagente
            '#play-video', // Obtenido desde el subagente
            'div.absolute.inset-0.flex.items-center.justify-center.z-10', // El overlay gigante de Play
            'button.bg-primary.rounded-full', // Botón nativo de la UI
            '.play-button',
            'svg.lucide-play'
        ];

        let clicked = false;

        // Esperemos que la pagina asiente sus listeners JS
        await new Promise(r => setTimeout(r, 2000));

        // Emulando click fisico basado en el subagente (BoundingBox)
        try {
            await page.waitForSelector('.playp, #play-video', { timeout: 8000 });
            const playBtn = await page.$('.playp') || await page.$('#play-video');
            if (playBtn) {
                // Hacer scroll hasta el boton nativo
                await playBtn.scrollIntoViewIfNeeded();
                const box = await playBtn.boundingBox();
                if (box) {
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    clicked = true;
                    console.log(`   ▶️ Botón Play presionado físicamente en coordenadas X:${Math.round(box.x + box.width / 2)} Y:${Math.round(box.y + box.height / 2)}`);
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Timeout esperando botones: ${e.message}`);
            console.log(`   ▶️ Aplicando Clic manual de seguridad en X:500 Y:400.`);
            await page.mouse.click(500, 400);
            clicked = true;
        }

        if (clicked) {
            // Esperar a que el iframe aparezca
            try {
                await page.waitForSelector('iframe', { timeout: 8000 });

                const iframeUrls = await page.evaluate(() => {
                    const iframes = Array.from(document.querySelectorAll('iframe'));
                    return iframes.map(frame => frame.src).filter(src => src && src.length > 5);
                });

                if (iframeUrls.length > 0) {
                    console.log(`   🔗 Iframe(s) encontrado(s): ${iframeUrls.length}`);
                    metadata.videoUrl = iframeUrls[0];
                    metadata.servers = iframeUrls;
                } else {
                    console.log(`   ⚠️ No se encontró la URL del reproductor (iframe vacío).`);
                }
            } catch (e) {
                console.log(`   ⚠️ Tiempo de espera agotado buscando el iframe del reproductor.`);
            }
        } else {
            console.log(`   ⚠️ No se pudo localizar o clickear el botón Play original.`);
        }

        return metadata;
    } catch (error) {
        console.error(`❌ Error raspando ${url}:`, error.message);
        return null;
    }
}

async function main() {
    const targetUrl = process.argv[2] || 'https://la.movie/peliculas';

    console.log(`🚀 Iniciando Web Scraper Automático con Puppeteer`);
    console.log(`🌐 Objetivo: ${targetUrl}`);

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    const page = await browser.newPage();

    // Antidetección
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    // Setear user agent para evitar bloqueos
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    // 1. Extraer lista de películas
    const links = await scrapeMovieLinks(page, targetUrl);

    // Limitar para prueba
    const limitLinks = links.slice(0, 5); // <- Cambiar esto para Scrapear todo el array

    console.log(`\n✅ Se encontraron ${links.length} URLs de contenido en el catálogo.`);
    console.log(`   Preparando para raspar ${limitLinks.length} videos (Modo Prueba).\n`);

    const results = [];

    // 2. Iterar cada película y extraer datos + reproductor
    for (const link of limitLinks) {
        const data = await scrapeMovieDetails(page, link);
        if (data) {
            results.push(data);
        }
        // Pequeña pausa para no saturar el server
        await new Promise(r => setTimeout(r, 2000));
    }

    await browser.close();

    // 3. Guardar resultados locales y Subir a Firebase
    const outputFile = './scripts/scraped_movies.json';
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n📄 Archivo local guardado en ${outputFile}`);

    console.log(`\n🔥 Subiendo ${results.length} ítems a Firestore (Colección "content")...`);

    // Configuración Firebase Admin
    let serviceAccount;
    try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        } else {
            const envContent = fs.readFileSync(join(__dirname, '.env'), 'utf-8');
            serviceAccount = JSON.parse(envContent);
        }
    } catch (error) {
        console.error('❌ Error leyendo las credenciales de Firebase.', error.message);
        process.exit(1);
    }

    try {
        // Asegurarse de no reinicializar Firebase si ya existe
        if (!global.firebaseApp) {
            global.firebaseApp = initializeApp({ credential: cert(serviceAccount) });
        }
        const db = getFirestore();
        let batch = db.batch();
        let count = 0;
        let totalUploaded = 0;

        for (const movie of results) {
            // Generar ID Unico para Peliculas usando el Titulo
            const id = 'vod-' + movie.title.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 40);

            const docData = {
                id,
                type: movie.type,
                title: movie.title,
                genre: movie.genre,
                poster: movie.poster || '',
                backdrop: '', // Agregaremos la capacidad de extraer esto luego si es necesario
                description: movie.description,
                rating: movie.rating || '',
                year: movie.year,
                videoUrl: movie.videoUrl || '',
                servers: movie.servers || []
            };

            const ref = db.collection('content').doc(id);
            batch.set(ref, docData, { merge: true });
            count++;
            console.log(`   ⬆️ Preparando: ${movie.title} (${id})`);

            if (count >= 450) {
                await batch.commit();
                totalUploaded += count;
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
            totalUploaded += count;
        }

        console.log(`\n🎉 Web Scraping y Firebase Sync Finalizado con éxito. Subidos: ${totalUploaded}`);

    } catch (err) {
        console.error(`❌ Error fatal escribiendo en Firebase: ${err.message}`);
    }
}

main().catch(console.error);

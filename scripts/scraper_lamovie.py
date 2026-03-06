import asyncio
import argparse
from playwright.async_api import async_playwright

async def scrape_lamovie(url, headless=True):
    print(f"[*] Starting la.movie scraper for: {url}")
    iframe_src = None
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport={'width': 1280, 'height': 720}
        )
        page = await context.new_page()
        
        async def log_request(request):
            nonlocal iframe_src
            if 'vimeos.net' in request.url or 'embed' in request.url:
                if request.resource_type in ['document', 'iframe'] and not iframe_src:
                    iframe_src = request.url
                    print(f"[+] Intercepted Iframe URL: {iframe_src}")

        page.on("request", log_request)
        
        try:
            print("[*] Navigating to page...")
            await page.goto(url, wait_until='domcontentloaded', timeout=15000)
            await page.wait_for_timeout(2000)
            
            print("[*] Simulating user click to trigger video load...")
            # La.movie uses a custom play button overlay that intercepts the first click
            # Clicking exactly in the center of the video player usually triggers it
            await page.mouse.click(640, 360)
            
            # Wait for the network request to fire and be intercepted
            print("[*] Waiting for video iframe to load...")
            await page.wait_for_timeout(4000)

            # Fallback check DOM if network intercept failed
            if not iframe_src:
                iframes = await page.locator("iframe").all()
                for frame in iframes:
                    src = await frame.get_attribute("src")
                    if src and ('vimeos' in src or 'embed' in src):
                        iframe_src = src
                        print(f"[+] Found iframe in DOM: {src}")
                        break

        except Exception as e:
            print(f"[!] Error during scraping: {e}")
            
        await browser.close()
        
        if iframe_src:
            print(f"\n--- SCRAPE SUCCESS ---")
            print(f"Iframe URL: {iframe_src}")
            return iframe_src
        else:
            print(f"\n[!] Failed to extract iframe URL.")
            return None

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Scrape iframes from la.movie')
    parser.add_argument('url', help='The la.movie URL to scrape')
    parser.add_argument('--visible', action='store_true', help='Run browser in visible mode')
    args = parser.parse_args()
    
    asyncio.run(scrape_lamovie(args.url, headless=not args.visible))

import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import sightingStore from '@/lib/sightingStore';
import { calculateMatchScore } from '@/lib/matcher';

export async function POST(req: Request) {
    let browser;
    try {
        const { latitude, longitude, keyword = "유기견", location = "우면동", sido, sigungu, dogProfile } = await req.json();

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();

        console.log("Navigating to Daangn...");
        await page.goto('https://www.daangn.com/kr/', { waitUntil: 'networkidle' });

        // 1. Navigation to '동네생활'
        console.log("Clicking '중고거래'...");
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('span, a, button'));
            const target = elements.find(el => el.textContent?.trim() === '중고거래');
            if (target) (target as HTMLElement).click();
        });
        await page.waitForTimeout(2000);

        console.log("Clicking '동네생활'...");
        await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('span, a, button'));
            const target = elements.find(el => el.textContent?.trim() === '동네생활');
            if (target) (target as HTMLElement).click();
        });
        await page.waitForTimeout(2000);

        // 2. Set location FIRST (before search)
        console.log("Setting location to " + location + "...");
        await page.evaluate(() => {
            const btn = document.querySelector('[data-gtm="gnb_location"]') as HTMLElement;
            if (btn) btn.click();
        });

        await page.waitForTimeout(2000);
        const locationInput = page.locator('input[aria-label="Search input"]').first();
        await locationInput.waitFor({ state: 'attached', timeout: 10000 });
        await locationInput.fill('');
        await locationInput.type(location, { delay: 150 });

        console.log(`Selecting choice for: ${location}`);
        const resultItem = page.locator(`text=${location}`).last();

        try {
            await resultItem.waitFor({ state: 'visible', timeout: 8000 });
            await resultItem.click({ force: true });
        } catch (e) {
            console.log("Strict text match failed, trying broader search...");
            await page.locator(`[role="option"]:has-text("${location}"), li:has-text("${location}")`).first().click({ force: true });
        }
        await page.waitForTimeout(3000);

        // 3. Search for the keyword
        console.log(`Searching for keyword: ${keyword}...`);
        const searchInput = page.getByPlaceholder('검색어를 입력해주세요');
        await searchInput.fill(keyword);
        await searchInput.press('Enter');

        // Wait for results
        console.log("Waiting for results to load...");
        await page.waitForTimeout(4000);
        await page.waitForLoadState('networkidle');

        // 4. Extraction logic
        console.log("Extracting articles...");
        const articles = await page.$$eval('article', (elements) => {
            return elements.map((el) => {
                const title = el.querySelector('h2')?.textContent?.trim() || "";
                const content = el.querySelector('p')?.textContent?.trim() || "";
                const region = el.querySelector('span span')?.textContent?.trim() || "";
                const timeEl = el.querySelector('time');
                const timestamp = timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString();
                const img = el.querySelector('img');
                const imgUrl = img ? (img.getAttribute('srcset')?.split(' ')[0] || img.src) : "";

                let link = "";
                const anchor = el.closest('a') || el.querySelector('a');
                if (anchor) link = anchor.href;

                return { title, content, region, imgUrl, link, timestamp };
            });
        });

        console.log(`Found ${articles.length} total articles.`);

        await browser.close();

        // 5. Transform and return results immediately
        const results = articles.map(art => {
            const existing = sightingStore.get(art.link);
            if (existing) {
                return { ...existing, source: 'Karrot' as const, keyword };
            }
            const sighting = {
                ...art,
                source: 'Karrot' as const,
                keyword,
                timestamp: art.timestamp || new Date().toISOString()
            };
            sightingStore.add(sighting);
            return sighting;
        });

        return NextResponse.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("Karrot Scraping Error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

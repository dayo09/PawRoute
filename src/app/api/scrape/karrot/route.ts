import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import sightingStore from '@/lib/sightingStore';
import geminiLimiter from '@/lib/geminiLimiter';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

async function analyzeSightingsBatch(items: { imgUrl: string, content: string, link: string }[]) {
    if (items.length === 0) return [];

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 1. Prepare image data parts for Gemini
        const imageParts = await Promise.all(items.map(async (item) => {
            if (!item.imgUrl || item.imgUrl.includes('data:image')) return null;
            try {
                const resp = await fetch(item.imgUrl);
                if (!resp.ok) return null;
                const buffer = await resp.arrayBuffer();
                return {
                    inlineData: {
                        data: Buffer.from(buffer).toString("base64"),
                        mimeType: resp.headers.get("content-type") || "image/jpeg"
                    }
                };
            } catch (e) {
                console.error(`Failed to fetch image for ${item.link}:`, e);
                return null;
            }
        }));

        // Filter valid parts to send to Gemini
        const validIndices: number[] = [];
        const validImages: any[] = [];
        imageParts.forEach((part, i) => {
            if (part) {
                validIndices.push(i);
                validImages.push(part);
            }
        });

        if (validImages.length === 0) return items.map(() => null);

        // 2. Build Multi-Item Prompt
        const contentsPrompt = validIndices.map((idx, i) =>
            `[Item ${i}] (Link: ${items[idx].link}): "${items[idx].content}"`
        ).join('\n\n');

        const prompt = `
You are an expert dog behaviorist analyzing multiple community posts for lost/found dogs.
I have provided ${validImages.length} images. Analyze each image alongside its corresponding post content provided below.

For EACH item, determine if it contains a dog and extract its characteristics.
Return a JSON array of objects, one for each image provided (in the same order 0 to ${validImages.length - 1}).

Format for each object:
{
  "index": number (corresponding to [Item X]),
  "isDog": boolean,
  "breed": "Breed name in Korean",
  "size": "소형/중형/대형",
  "color": "Fur color in Korean",
  "features": ["Feature 1", "Feature 2"],
  "isLostOrFound": "lost" | "found" | "unknown"
}

Post Contents:
${contentsPrompt}

Output ONLY the raw JSON array.
`;

        // Check Rate Limit before calling Gemini
        const allowed = await geminiLimiter.waitAcquire();
        if (!allowed) {
            console.error("Gemini rate limit exceeded, skipping batch analysis.");
            return items.map(() => null);
        }

        const result = await model.generateContent([prompt, ...validImages]);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const batchResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        // 3. Map batch results back to original items array
        const resultsMap = new Map();
        batchResults.forEach((res: any) => {
            if (typeof res.index === 'number' && validIndices[res.index] !== undefined) {
                resultsMap.set(validIndices[res.index], res);
            }
        });

        return items.map((_, i) => resultsMap.get(i) || null);

    } catch (error) {
        console.error("Batch Analysis error:", error);
        return items.map(() => null);
    }
}

export async function POST(req: Request) {
    let browser;
    try {
        const { latitude, longitude, keyword = "유기견", location = "우면동" } = await req.json();

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
        // Using evaluate click for better reliability on dynamically rendered elements
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
        // Remove exact: true because the result might be "우면동 (서울특별시 서초구)"
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

                // Region is often in a metadata area
                const region = el.querySelector('span span')?.textContent?.trim() || "";

                // Get timestamp for sorting
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

        // 5. Filter and analyze
        const filterKeywords = ['발견', '목격', '보호', '찾아요', '실종', '강아지', '개', '유기견'];
        const candidates = articles.filter(art =>
            filterKeywords.some(kw => art.content?.includes(kw) || art.title?.includes(kw))
        ).slice(0, 5);

        const analyzedResults = [];
        const toBatch = [];

        for (const art of candidates) {
            // Check if we already have this in store
            const existing = sightingStore.get(art.link);

            if (existing?.analysis) {
                console.log("Using stored result for:", art.link);
                analyzedResults.push(existing);
            } else if (art.imgUrl && !art.imgUrl.includes('data:image')) {
                toBatch.push(art);
            } else {
                const basicArticle = {
                    ...art,
                    source: 'Karrot' as const,
                    keyword,
                    timestamp: art.timestamp || new Date().toISOString()
                };
                sightingStore.add(basicArticle);
                analyzedResults.push(basicArticle);
            }
        }

        // Perform batch analysis for new candidates
        if (toBatch.length > 0) {
            console.log(`Batch analyzing ${toBatch.length} new Karrot candidates...`);
            const batchAnalyses = await analyzeSightingsBatch(toBatch);

            toBatch.forEach((art, i) => {
                const analysis = batchAnalyses[i];
                const fullArticle = {
                    ...art,
                    analysis,
                    source: 'Karrot' as const,
                    keyword,
                    timestamp: art.timestamp || new Date().toISOString()
                };

                // Save to store
                sightingStore.add(fullArticle);

                if (analysis && analysis.isDog) {
                    analyzedResults.push(fullArticle);
                }
            });
        }

        return NextResponse.json({
            success: true,
            count: analyzedResults.length,
            data: analyzedResults
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("Karrot Scraping Error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

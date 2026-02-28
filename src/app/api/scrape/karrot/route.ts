import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";
import sightingStore from '@/lib/sightingStore';
import geminiLimiter from '@/lib/geminiLimiter';
import { calculateMatchScore } from '@/lib/matcher';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

async function analyzeSightingsBatch(items: { imgUrl: string, content: string, link: string }[], dogProfile?: any) {
    if (items.length === 0) return [];

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

        const validIndices: number[] = [];
        const validImages: any[] = [];
        imageParts.forEach((part, i) => {
            if (part) {
                validIndices.push(i);
                validImages.push(part);
            }
        });

        const contentsPrompt = items.map((item, i) =>
            `[Item ${i}] (Link: ${item.link}): "${item.content}"`
        ).join('\n\n');

        const dogContext = dogProfile ? `The user is looking for a dog with these characteristics:
- Breed: ${dogProfile.breed}
- Color: ${dogProfile.primaryColor} ${dogProfile.secondaryColor || ''}
- Features: ${dogProfile.features?.join(', ')}
` : "";

        const systemInstructions = `
You are an expert dog behaviorist analyzing community posts for lost/found dogs.
Analyze the provided items (each item has a text description and potentially an image).
Determine if they match the lost dog described below.

${dogContext}

For EACH item, return a JSON object with:
- "index": the item number
- "isDog": boolean
- "matchScore": number (0.0 to 1.0) - How well this post matches the user's dog.
- "breed": Extracted breed in Korean
- "size": 소형/중형/대형
- "color": Extracted color in Korean
- "features": array of unique features
- "isLostOrFound": "lost" | "found" | "unknown"

Return ONLY a JSON array of these objects.
`;

        const parts: any[] = [systemInstructions];

        // Interleave text and images for better association
        items.forEach((item, i) => {
            parts.push(`--- ITEM ${i} ---`);
            parts.push(`Description: "${item.content}"`);
            if (imageParts[i]) {
                parts.push(imageParts[i]);
            }
        });

        const allowed = await geminiLimiter.waitAcquire();
        if (!allowed) return items.map(() => null);

        const result = await model.generateContent(parts);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const batchResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        const resultsMap = new Map();
        batchResults.forEach((res: any) => {
            if (typeof res.index === 'number') {
                resultsMap.set(res.index, res);
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
        ).slice(0, 40); // Increased limit

        const analyzedResults = [];
        const toBatch = [];

        for (const art of candidates) {
            // Check if we already have this in store
            const existing = sightingStore.get(art.link);

            if (existing?.analysis) {
                console.log("Using stored result for:", art.link);
                // Dynamically update match score based on current dogProfile
                if (dogProfile) {
                    existing.analysis.matchScore = calculateMatchScore(dogProfile, {
                        breed: existing.analysis.breed,
                        size: existing.analysis.size,
                        color: existing.analysis.color,
                        features: existing.analysis.features
                    });
                }
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

        // Perform batch analysis in chunks of 15 to stay safe
        if (toBatch.length > 0) {
            const chunkSize = 15;
            for (let i = 0; i < toBatch.length; i += chunkSize) {
                const chunk = toBatch.slice(i, i + chunkSize);
                console.log(`Batch analyzing ${chunk.length} Karrot candidates...`);
                const batchAnalyses = await analyzeSightingsBatch(chunk, dogProfile);

                chunk.forEach((art, j) => {
                    const analysis = batchAnalyses[j];
                    const fullArticle = { ...art, analysis, source: 'Karrot' as const, keyword, timestamp: art.timestamp || new Date().toISOString() };
                    sightingStore.add(fullArticle);
                    analyzedResults.push(fullArticle);
                });
            }
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

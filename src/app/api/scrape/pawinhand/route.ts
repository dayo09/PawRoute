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
                console.error(`Failed to fetch image for PawInHand ${item.link}:`, e);
                return null;
            }
        }));

        // Filter valid parts
        const validIndices: number[] = [];
        const validImages: any[] = [];
        imageParts.forEach((part, i) => {
            if (part) {
                validIndices.push(i);
                validImages.push(part);
            }
        });

        if (validImages.length === 0) return items.map(() => null);

        // 2. Build Prompt
        const contentsPrompt = validIndices.map((idx, i) =>
            `[Item ${i}] (Link: ${items[idx].link}): "${items[idx].content}"`
        ).join('\n\n');

        const prompt = `
You are an expert dog behaviorist analyzing multiple community posts from PawInHand.
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
            console.error("Gemini rate limit exceeded (PawInHand), skipping batch analysis.");
            return items.map(() => null);
        }

        const result = await model.generateContent([prompt, ...validImages]);
        const text = result.response.text();
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const batchResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        const resultsMap = new Map();
        batchResults.forEach((res: any) => {
            if (typeof res.index === 'number' && validIndices[res.index] !== undefined) {
                resultsMap.set(validIndices[res.index], res);
            }
        });

        return items.map((_, i) => resultsMap.get(i) || null);

    } catch (error) {
        console.error("PawInHand Batch Analysis error:", error);
        return items.map(() => null);
    }
}

export async function POST(req: Request) {
    let browser;
    try {
        const { latitude, longitude, keyword, location } = await req.json();
        // PawInHand usually has a search or list page.
        // We will refine this once the user provides specific interaction details.
        const url = "https://pawinhand.kr/"; // Placeholder URL

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // TODO: Implement specific interactions provided by user
        // Example: search for '강아지', '유기견', '목격'

        // Placeholder extraction logic
        const articles = await page.$$eval('.article-item', (elements) => {
            return elements.map((el) => {
                const title = el.querySelector('.title')?.textContent?.trim() || "";
                const content = el.querySelector('.description')?.textContent?.trim() || "";
                const region = el.querySelector('.location')?.textContent?.trim() || "";
                const imgUrl = el.querySelector('img')?.src || "";
                const link = (el as HTMLAnchorElement)?.href || "";
                return { title, content, region, imgUrl, link };
            });
        });

        await browser.close();

        // For now, return empty or mock if no elements found to avoid errors
        if (articles.length === 0) {
            return NextResponse.json({
                success: true,
                count: 0,
                data: [],
                message: "Waiting for specific selectors to be implemented"
            });
        }

        const analyzedResults = [];
        const toBatch = [];

        for (const art of articles.slice(0, 3)) {
            const existing = sightingStore.get(art.link);
            if (existing?.analysis) {
                analyzedResults.push(existing);
            } else if (art.imgUrl && !art.imgUrl.includes('data:image')) {
                toBatch.push(art);
            } else {
                const basicArticle = {
                    ...art,
                    source: 'PawInHand' as const,
                    keyword,
                    timestamp: new Date().toISOString()
                };
                sightingStore.add(basicArticle);
                analyzedResults.push(basicArticle);
            }
        }

        if (toBatch.length > 0) {
            console.log(`Batch analyzing ${toBatch.length} new PawInHand candidates...`);
            const batchAnalyses = await analyzeSightingsBatch(toBatch);

            toBatch.forEach((art, i) => {
                const analysis = batchAnalyses[i];
                const fullArticle = {
                    ...art,
                    analysis,
                    source: 'PawInHand' as const,
                    keyword,
                    timestamp: new Date().toISOString()
                };
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
        console.error("PawInHand Scraping Error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

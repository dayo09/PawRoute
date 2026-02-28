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

        const validImages: any[] = imageParts.filter(part => part !== null);

        const contentsPrompt = items.map((item, i) =>
            `[Item ${i}] (Link: ${item.link}): "${item.content}"`
        ).join('\n\n');

        const dogContext = dogProfile ? `The user is looking for a dog with these characteristics:
- Breed: ${dogProfile.breed}
- Color: ${dogProfile.primaryColor} ${dogProfile.secondaryColor || ''}
- Features: ${dogProfile.features?.join(', ')}
` : "";

        const systemInstructions = `
You are an expert dog behaviorist analyzing community posts from PawInHand.
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

        // Interleave text and images
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
        console.error("PawInHand Batch Analysis error:", error);
        return items.map(() => null);
    }
}

export async function POST(req: Request) {
    let browser;
    try {
        const { latitude, longitude, keyword, location, sido, sigungu, dogProfile } = await req.json();
        const url = "https://pawinhand.kr/";

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // 1. Navigation to "실종/제보"
        await page.getByRole('list').getByRole('link', { name: '실종/제보' }).click();
        await page.waitForTimeout(2000);

        // 2. Select Location
        await page.getByText('모든 지역').click();
        await page.locator('section').filter({ hasText: '지역 설정' }).getByRole('combobox').first().selectOption(sido || '서울특별시');
        await page.getByRole('combobox').nth(3).selectOption(sigungu || '서초구');

        // 3. Animal type (Dog)
        await page.locator('section').filter({ hasText: '축종 설정' }).getByRole('combobox').selectOption('개');

        // 4. Search
        await page.getByRole('button', { name: '검색하기' }).click();
        await page.waitForTimeout(3000);

        // 5. Extract articles
        const articles = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('a'));
            return items
                .filter(a => {
                    const text = a.innerText || "";
                    return (text.includes('2025') || text.includes('2026')) && a.querySelector('img');
                })
                .map(a => {
                    const img = a.querySelector('img');
                    return {
                        title: a.innerText.split('\n')[0] || "포인핸드 게시글",
                        content: a.innerText.replace(/\n/g, ' ').trim(),
                        region: "",
                        imgUrl: img ? img.src : "",
                        link: a.href,
                        timestamp: new Date().toISOString()
                    };
                })
                .slice(0, 40);
        });

        await browser.close();

        const analyzedResults = [];
        const toBatch = [];

        for (const art of articles) {
            const existing = sightingStore.get(art.link);
            if (existing?.analysis) {
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
            } else {
                toBatch.push(art);
            }
        }

        if (toBatch.length > 0) {
            const chunkSize = 15;
            for (let i = 0; i < toBatch.length; i += chunkSize) {
                const chunk = toBatch.slice(i, i + chunkSize);
                console.log(`Batch analyzing ${chunk.length} PawInHand candidates...`);
                const batchAnalyses = await analyzeSightingsBatch(chunk, dogProfile);

                chunk.forEach((art, j) => {
                    const analysis = batchAnalyses[j];
                    const fullArticle = { ...art, analysis, source: 'PawInHand' as const, keyword: keyword || "", timestamp: art.timestamp || new Date().toISOString() };
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
        console.error("PawInHand Scraper Error:", error);
        if (browser) await browser.close();
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

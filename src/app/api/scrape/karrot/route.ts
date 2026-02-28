import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

async function analyzeSighting(imgUrl: string, content: string) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Fetch image as array buffer
        const imgResp = await fetch(imgUrl);
        if (!imgResp.ok) throw new Error("Failed to fetch image");
        const imgData = await imgResp.arrayBuffer();

        const prompt = `
      You are analyzing a potential lost dog sighting from a community post.
      Post Content: "${content}"
      
      Analyze the image and content. Determine if this is a dog, and extract features:
      {
        "isDog": boolean,
        "breed": "Breed name",
        "size": "Small/Medium/Large",
        "color": "Fur color",
        "features": ["Feature 1", "Feature 2"],
        "isLostOrFound": "lost" | "found" | "unknown"
      }
      Output only JSON.
    `;

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: Buffer.from(imgData).toString("base64"),
                    mimeType: imgResp.headers.get("content-type") || "image/jpeg"
                }
            }
        ]);

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (error) {
        console.error("Analysis error for sighting:", error);
        return null;
    }
}

export async function POST(req: Request) {
    let browser;
    try {
        const { latitude, longitude } = await req.json();

        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // Create context with geolocation
        const context = await browser.newContext({
            geolocation: { latitude, longitude },
            permissions: ['geolocation']
        });

        const page = await context.newPage();

        // Go to Karrot 'Nearby' (동네생활) section
        // For now, using search results as a proxy since direct navigation to 'Nearby' with geolocation 
        // often requires more complex interaction. 
        // We'll search for '유기견' and then try to filter for '동네생활' posts.
        const searchKeyword = "유기견";
        const url = `https://www.daangn.com/search/${encodeURIComponent(searchKeyword)}`;

        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Extraction logic (updated to handle potentially different DOM structures in 'Nearby' results)
        const articles = await page.$$eval('.article-content', (elements) => {
            return elements.map((el) => {
                const title = el.querySelector('.article-title')?.textContent?.trim() || "";
                const content = el.querySelector('.article-content-inner')?.textContent?.trim() || "";
                const region = el.querySelector('.article-region-name')?.textContent?.trim() || "";
                const imgUrl = el.querySelector('img')?.src || "";
                const link = (el.closest('a') as HTMLAnchorElement)?.href || "";
                return { title, content, region, imgUrl, link };
            });
        });

        await browser.close();

        // Filter and analyze candidates
        const filterKeywords = ['발견', '목격', '보호', '찾아요', '실종', '강아지'];
        const candidates = articles.filter(art =>
            filterKeywords.some(kw => art.content?.includes(kw) || art.title?.includes(kw))
        ).slice(0, 3);

        const analyzedArticles = [];
        for (const art of candidates) {
            if (art.imgUrl && !art.imgUrl.includes('data:image')) {
                const analysis = await analyzeSighting(art.imgUrl, art.content);
                if (analysis && analysis.isDog) {
                    analyzedArticles.push({ ...art, analysis });
                }
            } else {
                analyzedArticles.push(art);
            }
        }

        return NextResponse.json({
            success: true,
            count: analyzedArticles.length,
            data: analyzedArticles
        });

    } catch (error) {
        if (browser) await browser.close();
        console.error("Scraping Error:", error);

        // Fallback Mock Data with Location context
        const mockSightings = [
            {
                title: "방금 앞 정원에서 하얀색 말티즈 발견했습니다",
                content: "산책하다가 혼자 돌아다니는거 봤어요. 빨간색 목줄 하고 있습니다. 지금은 인근 카페에서 보호 중이에요.",
                region: "사용자 인근 동네",
                imgUrl: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?q=80&w=1000&auto=format&fit=crop",
                link: "https://www.daangn.com",
                analysis: {
                    isDog: true,
                    breed: "말티즈",
                    size: "Small",
                    color: "White",
                    features: ["빨간색 목줄", "사람을 잘 따름"],
                    isLostOrFound: "found"
                }
            }
        ];

        return NextResponse.json({
            success: true,
            count: mockSightings.length,
            data: mockSightings,
            isMock: true
        });
    }
}

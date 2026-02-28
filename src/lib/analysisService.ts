import { GoogleGenerativeAI } from "@google/generative-ai";
import geminiLimiter from "./geminiLimiter";
import { safeGenerateContent } from "./gemini";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export interface AnalysisItem {
    imgUrl: string;
    content: string;
    link: string;
}

export async function analyzeSightingsBatch(items: AnalysisItem[], dogProfile?: any) {
    if (items.length === 0) return [];

    try {
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
                console.error(`[AnalysisService] Failed to fetch image for ${item.link}:`, e);
                return null;
            }
        }));

        const dogContext = dogProfile ? `The user is looking for a dog with these characteristics:
- Breed: ${dogProfile.breed}
- Color: ${dogProfile.primaryColor} ${dogProfile.secondaryColor || ''}
- Features: ${dogProfile.features?.join(', ')}
` : "No specific dog profile provided. Analyze general relevance.";

        const systemInstructions = `
You are an expert dog behaviorist analyzing community posts for lost/found dogs.
Analyze the provided items (each item has a text description and potentially an image).
Determine if they match the lost dog described below.

${dogContext}

For EACH item, return a JSON object with:
- "index": the item number
- "isDog": boolean
- "aiMatchScore": number (0.0 to 1.0) - How likely is this post a valid dog sighting/found report?
- "featureMatchScore": number (0.0 to 1.0) - How much does the dog in this post actually look like the user's dog?
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

        // Use the user's preferred model
        const resultText = await safeGenerateContent("gemini-2.5-flash-lite", parts);
        const jsonMatch = resultText.match(/\[[\s\S]*\]/);
        const batchResults = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        const resultsMap = new Map();
        batchResults.forEach((res: any) => {
            const idx = typeof res.index === 'string' ? parseInt(res.index) : res.index;
            if (typeof idx === 'number' && !isNaN(idx)) {
                resultsMap.set(idx, res);
            }
        });

        return items.map((_, i) => resultsMap.get(i) || null);

    } catch (error) {
        console.error("[AnalysisService] Batch Analysis error:", error);
        return items.map(() => null);
    }
}

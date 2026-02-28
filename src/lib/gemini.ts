import { GoogleGenerativeAI } from "@google/generative-ai";
import geminiLimiter from "./geminiLimiter";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export async function safeGenerateContent(modelName: string, parts: any[], maxRetries = 3) {
    const model = genAI.getGenerativeModel({ model: modelName });
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const allowed = await geminiLimiter.waitAcquire();
        if (!allowed) {
            throw new Error("Rate limit wait timeout");
        }

        try {
            const result = await model.generateContent(parts);
            const response = await result.response;
            return response.text();
        } catch (error: any) {
            lastError = error;

            // Check for 429 Too Many Requests
            if (error.status === 429) {
                const retryAfter = error.errorDetails?.[0]?.retryDelay;
                let waitMs = 5000; // Default 5s

                if (retryAfter) {
                    // Extract seconds from duration string (e.g., "47s")
                    const seconds = parseInt(retryAfter.replace('s', ''));
                    if (!isNaN(seconds)) {
                        waitMs = (seconds + 1) * 1000;
                    }
                } else {
                    // Exponential backoff fallback
                    waitMs = Math.pow(2, attempt) * 5000;
                }

                console.warn(`[Gemini] 429 Caught. Retrying after ${waitMs}ms (Attempt ${attempt + 1}/${maxRetries})`);
                geminiLimiter.pause(waitMs);
                await new Promise(resolve => setTimeout(resolve, waitMs));
                continue;
            }

            // Other errors
            console.error(`[Gemini] Error on attempt ${attempt + 1}:`, error);
            throw error;
        }
    }

    throw lastError || new Error("Max retries exceeded");
}

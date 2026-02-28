import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || "");

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const images = formData.getAll("images") as File[];

        if (!images || images.length === 0) {
            return NextResponse.json({ error: "No images provided" }, { status: 400 });
        }

        // Convert Files to GenerativePart
        const imageParts = await Promise.all(
            images.map(async (img) => {
                const bytes = await img.arrayBuffer();
                return {
                    inlineData: {
                        data: Buffer.from(bytes).toString("base64"),
                        mimeType: img.type,
                    },
                };
            })
        );

        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `
      You are an expert dog behaviorist and breed specialist. 
      Analyze the provided images of a dog and extract the following features in JSON format:
      {
        "breed": "Breed name (or 'Mixed' if unclear)",
        "size": "Small/Medium/Large/Extra Large",
        "primaryColor": "Main fur color",
        "secondaryColor": "Secondary fur color (if any)",
        "features": ["Feature 1", "Feature 2", "Distinctive marks like collars, scars, or patterns"],
        "confidence": 0.0 to 1.0
      }
      Be as specific as possible. If multiple dogs are present, focus on the most prominent one.
      Output ONLY the JSON.
    `;

        const result = await model.generateContent([prompt, ...imageParts]);
        const response = await result.response;
        const text = response.text();

        // Extract JSON from potential markdown code blocks
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Failed to parse Gemini response");
        }

        const data = JSON.parse(jsonMatch[0]);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}

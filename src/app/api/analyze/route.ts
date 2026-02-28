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
      Analyze the provided images of a dog and extract the following features in JSON format (Value should be in Korean):
      {
        "breed": "품종 이름 (불확실하면 '믹스견')",
        "size": "소형/중형/대형",
        "primaryColor": "주된 털 색상 (예: 하얀색, 갈색, 검정색)",
        "secondaryColor": "보조 털 색상 (있을 경우)",
        "features": ["특징 1", "특징 2", "인식 가능한 특징 (목줄, 상처, 패턴 등)"],
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

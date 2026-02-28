import { NextResponse } from "next/server";
import { analyzeSightingsBatch } from "@/lib/analysisService";

export async function POST(req: Request) {
    try {
        const { items, dogProfile } = await req.json();

        if (!items || !items.length) {
            return NextResponse.json({ results: [] });
        }

        const batchResults = await analyzeSightingsBatch(items, dogProfile);

        return NextResponse.json({ results: batchResults });

    } catch (error) {
        console.error("Batch analysis endpoint error:", error);
        return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
    }
}

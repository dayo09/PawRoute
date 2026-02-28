import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { latitude, longitude, keyword: userKeyword, location: userLocation, sido: userSido, sigungu: userSigungu, dogProfile } = body;

        const defaultKeywords = ["강아지", "유기견", "목격"];
        const keywords = userKeyword ? [userKeyword] : defaultKeywords;
        const location = userLocation || "우면동";
        const sido = userSido || "서울특별시";
        const sigungu = userSigungu || "서초구";

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        const allResults: any[] = [];
        const summary = { karrot: 0, pawinhand: 0 };

        for (const kw of keywords) {
            // Trigger both scrapers for each keyword
            const [karrotResp, pawinhandResp] = await Promise.all([
                fetch(`${baseUrl}/api/scrape/karrot`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude, keyword: kw, location, sido, sigungu, dogProfile })
                }).then(res => res.json()).catch(err => ({ success: false, error: err.message })),

                fetch(`${baseUrl}/api/scrape/pawinhand`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ latitude, longitude, keyword: kw, location, sido, sigungu, dogProfile })
                }).then(res => res.json()).catch(err => ({ success: false, error: err.message }))
            ]);

            if (karrotResp.success && karrotResp.data) {
                karrotResp.data.forEach((item: any) => {
                    if (!allResults.some(r => r.link === item.link)) {
                        allResults.push({ ...item, source: 'Karrot', keyword: kw });
                        summary.karrot++;
                    }
                });
            }

            if (pawinhandResp.success && pawinhandResp.data) {
                pawinhandResp.data.forEach((item: any) => {
                    if (!allResults.some(r => r.link === item.link)) {
                        allResults.push({ ...item, source: 'PawInHand', keyword: kw });
                        summary.pawinhand++;
                    }
                });
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            results: allResults,
            summary
        });

    } catch (error) {
        console.error("Scan Error:", error);
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

import { NextResponse } from 'next/server';
import { chromium } from 'playwright';
import sightingStore from '@/lib/sightingStore';

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

        // 6. Transform and return results immediately
        const results = articles.map(art => {
            const existing = sightingStore.get(art.link);
            if (existing) {
                return { ...existing, source: 'PawInHand' as const, keyword: keyword || "" };
            }
            const sighting = {
                ...art,
                source: 'PawInHand' as const,
                keyword: keyword || "",
                timestamp: art.timestamp || new Date().toISOString()
            };
            sightingStore.add(sighting);
            return sighting;
        });

        return NextResponse.json({
            success: true,
            count: results.length,
            data: results
        });

    } catch (error) {
        console.error("PawInHand Scraper Error:", error);
        if (browser) await browser.close();
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}

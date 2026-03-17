import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
    try {
        const { category, pageStart, pageCount } = await req.json();

        if (!category) {
            return NextResponse.json({ success: false, error: '카테고리가 정의되지 않았습니다.' }, { status: 400 });
        }

        console.log(`[Relay Sync] Scaling Category: ${category}, Pages: ${pageStart}~${pageStart + (pageCount - 1)}`);

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseClient = createClient(supabaseUrl, serviceKey || supabaseAnonKey);

        const init = await fetch(`https://www.youngjaecomputer.com/shop/search.php?search_text=${category}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36' }
        });
        const cookieArray = init.headers.getSetCookie() || [];
        const cookies = cookieArray.map(c => c.split(';')[0]).join('; ');

        const foundItems: any[] = [];

        // 요청받은 범위의 페이지만 병렬 수집
        const pageTasks = Array.from({ length: pageCount }).map(async (_, i) => {
            const pageNum = pageStart + i;
            try {
                const res = await fetch('https://www.youngjaecomputer.com/shop/search.inc.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Referer': `https://www.youngjaecomputer.com/shop/search.php?search_text=${category}`,
                        'Cookie': cookies,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                    },
                    body: new URLSearchParams({
                        search_text: category,
                        page: pageNum.toString(),
                        ca_id_search: '',
                        s_order: 'best'
                    }).toString()
                });

                if (!res.ok) return;
                const html = await res.text();
                const $ = cheerio.load(html);

                // 규칙: table 태그 및 #nList_Cell 아이디를 가진 셀만 추적
                $('table, #nList_Cell').each((_, el) => {
                    const $el = $(el);
                    const href = $el.find('a[href*="it_id="]').first().attr('href');
                    const itIdMatch = href?.match(/it_id=(\d+)/);
                    if (!itIdMatch) return;

                    const itId = itIdMatch[1];
                    // 규칙: it_id가 '2'로 시작하는 10자리 숫자인 경우만 유효
                    if (!itId.startsWith('2') || itId.length !== 10) return;

                    const text = $el.text().replace(/\s+/g, ' ').trim();
                    // Strict Regex: [Category][Digits(no leading zero)][Optional _Variation]
                    // We look for whole words to avoid partial matches in descriptions
                    const regex = new RegExp(`\\b(${category})([1-9]\\d*)(\\_(?:\\d{1,2}|[WB]|\\d[WB]|[a-zA-Z0-9]{1,3})?)?\\b`, 'i');
                    const match = text.match(regex);

                    if (match && itId.startsWith('2')) {
                        const fullMatch = match[0];

                        // Rule Check: No spaces or hyphens allowed within the code part of the text
                        // Even if regex matches a part, we check if the surrounding context was valid
                        const code = fullMatch.toUpperCase();
                        const url = `https://www.youngjaecomputer.com/shop/item.php?it_id=${itId}`;

                        foundItems.push({
                            category,
                            sequence_number: parseInt(match[2], 10),
                            full_code: code,
                            product_url: url
                        });
                    }
                });
            } catch (e) { }
        });

        await Promise.all(pageTasks);

        // 수집된 데이터를 DB에 즉시 반영 (URL 병합 로직 적용)
        if (foundItems.length > 0) {
            const foundCodes = Array.from(new Set(foundItems.map(i => i.full_code)));

            // 1. 기존 DB에 있는 해당 코드들의 데이터 가져오기
            const { data: existingItems } = await supabaseClient
                .from('product_codes')
                .select('full_code, product_url')
                .in('full_code', foundCodes);

            const existingMap = new Map<string, string>();
            existingItems?.forEach(item => {
                existingMap.set(item.full_code, item.product_url || '');
            });

            // 2. 새로운 URL과 기존 URL 병합
            const uniqueItems = new Map<string, any>();
            foundItems.forEach(item => {
                const existingUrls = existingMap.get(item.full_code) || '';
                const combinedUrls = Array.from(new Set([
                    ...existingUrls.split(',').map(u => u.trim()),
                    item.product_url
                ])).filter(Boolean).join(', ');

                if (!uniqueItems.has(item.full_code)) {
                    uniqueItems.set(item.full_code, { ...item, product_url: combinedUrls });
                } else {
                    const current = uniqueItems.get(item.full_code);
                    const merged = Array.from(new Set([
                        ...current.product_url.split(',').map((u: string) => u.trim()),
                        item.product_url
                    ])).filter(Boolean).join(', ');
                    uniqueItems.set(item.full_code, { ...current, product_url: merged });
                }
            });

            const toUpsert = Array.from(uniqueItems.values());
            const { error: upsertError } = await supabaseClient
                .from('product_codes')
                .upsert(toUpsert, { onConflict: 'full_code' });

            if (upsertError) {
                console.error('[Relay Sync] DB Error:', upsertError.message);
            }
        }

        return NextResponse.json({
            success: true,
            count: foundItems.length,
            items: foundItems.map(i => i.full_code)
        });

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

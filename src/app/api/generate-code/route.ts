import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

const VALID_CATEGORIES = ['GY', 'DY', 'VY', 'OY', 'HY'];

export async function POST(request: Request) {
    try {
        const { category, product_url, manualFullCode, manualSequenceNumber } = await request.json();

        if (!category || !VALID_CATEGORIES.includes(category.toUpperCase())) {
            return NextResponse.json(
                { success: false, error: '유효한 카테고리가 아닙니다. (GY, DY, VY, OY, HY만 가능)' },
                { status: 400 }
            );
        }

        const upperCategory = category.toUpperCase();
        let finalSequenceNumber: number;
        let finalFullCode: string;

        if (manualFullCode && manualSequenceNumber !== undefined) {
            finalSequenceNumber = manualSequenceNumber;
            // 수동 입력 시에도 표준화 적용: 숫자 앞 0 제거, 공백 제거, 하이픈을 언더바로 변경
            const tempCode = manualFullCode.toUpperCase().replace(/\s+/g, '').replace(/-/g, '_');

            // 만약 언더바가 없고 숫자로 끝나는 코드인데 수동 시퀀스가 product_codes에 이미 있는 경우 등 
            // 복잡한 케이스 보다는 규칙에 따라 재구성
            const categoryMatch = tempCode.match(new RegExp(`^(${VALID_CATEGORIES.join('|')})`, 'i'));
            if (categoryMatch) {
                const cat = categoryMatch[1].toUpperCase();
                const remainder = tempCode.substring(cat.length);
                const parts = remainder.split('_');
                const num = parseInt(parts[0], 10).toString();
                const variant = parts[1] || '';
                finalFullCode = `${cat}${num}${variant ? '_' + variant : ''}`;
            } else {
                finalFullCode = tempCode;
            }
        } else {
            // 1. 해당 카테고리의 가장 큰 sequence_number 조회 (정수값 기준)
            const { data: existingCodes, error: fetchError } = await supabase
                .from('product_codes')
                .select('sequence_number')
                .eq('category', upperCategory)
                .order('sequence_number', { ascending: false })
                .limit(1);

            if (fetchError) {
                console.error('Supabase fetch error:', fetchError);
                return NextResponse.json(
                    { success: false, error: '시퀀스 번호를 조회하는 데 실패했습니다.' },
                    { status: 500 }
                );
            }

            // 2. 새로운 sequence_number 결정 (숫자 앞 0 제거를 위해 단순히 숫자로 관리)
            let nextSequenceNumber = 1;
            if (existingCodes && existingCodes.length > 0) {
                nextSequenceNumber = Math.floor(existingCodes[0].sequence_number) + 1;
            }

            finalSequenceNumber = nextSequenceNumber;
            // 규칙: GY001(X) -> GY1(O), 띄어쓰기 금지
            finalFullCode = `${upperCategory}${nextSequenceNumber}`;
        }

        // 3. 중복 체크 및 URL 병합 처리
        const { data: existingRecord, error: checkError } = await supabase
            .from('product_codes')
            .select('id, product_url')
            .eq('full_code', finalFullCode)
            .single();

        if (existingRecord) {
            // 동일한 full_code가 존재할 경우 URL 병합
            const existingUrls = existingRecord.product_url ? existingRecord.product_url.split(',').map((u: string) => u.trim()) : [];
            const newUrls = product_url ? product_url.split(',').map((u: string) => u.trim()) : [];
            const combinedUrls = Array.from(new Set([...existingUrls, ...newUrls])).filter(Boolean).join(', ');

            const { data: updatedData, error: updateError } = await supabase
                .from('product_codes')
                .update({ product_url: combinedUrls })
                .eq('id', existingRecord.id)
                .select()
                .single();

            if (updateError) {
                return NextResponse.json({ success: false, error: '기존 코드에 URL을 병합하는 데 실패했습니다.' }, { status: 500 });
            }
            return NextResponse.json({ success: true, data: updatedData, message: '기존 코드에 URL이 병합되었습니다.' }, { status: 200 });
        }

        // 4. 새로운 데이터를 DB에 INSERT
        const { data: insertedData, error: insertError } = await supabase
            .from('product_codes')
            .insert([
                {
                    category: upperCategory,
                    sequence_number: finalSequenceNumber,
                    full_code: finalFullCode,
                    product_url: product_url || null,
                },
            ])
            .select()
            .single();

        if (insertError) {
            console.error('Supabase insert error:', insertError);
            return NextResponse.json(
                { success: false, error: '새로운 코드를 생성하는 데 실패했습니다.' },
                { status: 500 }
            );
        }

        // 5. 성공 결과 반환
        return NextResponse.json({ success: true, data: insertedData }, { status: 201 });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

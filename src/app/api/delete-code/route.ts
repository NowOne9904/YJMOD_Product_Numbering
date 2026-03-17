import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export async function POST(request: Request) {
    try {
        const { id } = await request.json();

        if (!id) {
            return NextResponse.json(
                { success: false, error: '삭제할 아이디가 필요합니다.' },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from('product_codes')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete error:', error);
            return NextResponse.json(
                { success: false, error: '삭제에 실패했습니다.' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, message: '삭제되었습니다.' });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: '서버 내부 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

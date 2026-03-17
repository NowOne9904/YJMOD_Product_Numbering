import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export async function GET() {
    return NextResponse.json({ message: 'Reset API is alive and reachable. Please use POST to perform reset.' });
}

export async function POST() {
    console.log('--- RESET-DB POST REQUEST RECEIVED ---');
    try {
        // Use a filter that matches everything. For serial ID, id > 0 is common.
        // Or not('id', 'is', null) is more universal.
        const { error } = await supabase
            .from('product_codes')
            .delete()
            .not('id', 'is', null);

        if (error) {
            console.error('Supabase Delete Error:', error);
            return NextResponse.json({
                success: false,
                error: error.message,
                details: error
            }, { status: 400 });
        }

        return NextResponse.json({ success: true, message: '모든 데이터가 초기화되었습니다.' });
    } catch (error: any) {
        console.error('Reset error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || (typeof error === 'string' ? error : JSON.stringify(error)) || '데이터 초기화에 실패했습니다.',
            details: error
        }, { status: 500 });
    }
}

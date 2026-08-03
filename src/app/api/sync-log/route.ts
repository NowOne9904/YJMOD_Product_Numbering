import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

export async function POST(req: Request) {
    try {
        const { type, status, items_found, triggered_by, started_at } = await req.json();

        // Netlify는 실제 방문자 IP를 x-nf-client-connection-ip 헤더로 전달한다.
        const ip =
            req.headers.get('x-nf-client-connection-ip') ||
            req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            'unknown';

        const { error } = await supabase.from('sync_logs').insert({
            type,
            status,
            items_found: items_found || 0,
            triggered_by: triggered_by || null,
            ip_address: ip,
            started_at: started_at || null
        });

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

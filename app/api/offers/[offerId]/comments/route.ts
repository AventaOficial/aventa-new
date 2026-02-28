import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles?:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

function toComment(row: CommentRow) {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const username = prof?.display_name?.trim() || 'Usuario';
  return {
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    author: { username },
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const offerId = (await params).offerId?.trim();
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId required' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, profiles:public_profiles_view!user_id(display_name)')
    .eq('offer_id', offerId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[comments] GET:', error.message);
    return NextResponse.json({ error: 'Error loading comments' }, { status: 500 });
  }

  const comments = (rows ?? []).map((row: CommentRow) => toComment(row));
  return NextResponse.json({ comments });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const offerId = (await params).offerId?.trim();
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId required' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(ip, 'comments');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados comentarios. Espera un momento.' }, { status: 429 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Config error' }, { status: 500 });
  }

  const userRes = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
  });
  if (!userRes.ok) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const userData = await userRes.json().catch(() => null);
  const userId = userData?.id ?? null;
  if (!userId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.content === 'string' ? body.content.trim() : '';
  if (raw.length === 0 || raw.length > 280) {
    return NextResponse.json({ error: 'Contenido entre 1 y 280 caracteres' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data: inserted, error: insertError } = await supabase
    .from('comments')
    .insert({ offer_id: offerId, user_id: userId, content: raw })
    .select('id, content, created_at, user_id')
    .single();

  if (insertError) {
    console.error('[comments] POST insert:', insertError.message);
    return NextResponse.json({ error: 'Error al publicar comentario' }, { status: 500 });
  }

  const { data: withProfile } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, profiles:public_profiles_view!user_id(display_name)')
    .eq('id', inserted.id)
    .single();

  const comment = withProfile ? toComment(withProfile as CommentRow) : {
    id: inserted.id,
    content: inserted.content,
    created_at: inserted.created_at,
    author: { username: (userData?.user_metadata?.display_name?.trim() || userData?.email?.split('@')[0]) || 'Usuario' },
  };
  return NextResponse.json(comment);
}

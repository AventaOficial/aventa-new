import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { recalculateUserReputation } from '@/lib/server/reputation';

/** POST: dar o quitar like a un comentario (toggle). Requiere auth. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string; commentId: string }> }
) {
  const { offerId, commentId } = await params;
  const cId = commentId?.trim();
  const oId = offerId?.trim();
  if (!cId || !isValidUuid(cId) || !oId || !isValidUuid(oId)) {
    return NextResponse.json({ error: 'offerId y commentId requeridos' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(ip, 'comments');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiadas acciones. Espera un momento.' }, { status: 429 });
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

  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', cId)
    .eq('user_id', userId)
    .maybeSingle();

  const { data: commentRow } = await supabase
    .from('comments')
    .select('user_id')
    .eq('id', cId)
    .single();
  const commentAuthorId = (commentRow as { user_id?: string } | null)?.user_id;

  if (existing) {
    const { error: delErr } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', cId)
      .eq('user_id', userId);
    if (delErr) {
      console.error('[comment-like] delete:', delErr.message);
      return NextResponse.json({ error: 'Error al quitar like' }, { status: 500 });
    }
    if (commentAuthorId) recalculateUserReputation(commentAuthorId).catch(() => {});
    return NextResponse.json({ liked: false });
  }

  const { error: insErr } = await supabase
    .from('comment_likes')
    .insert({ comment_id: cId, user_id: userId });
  if (insErr) {
    console.error('[comment-like] insert:', insErr.message);
    return NextResponse.json({ error: 'Error al dar like' }, { status: 500 });
  }

  if (commentAuthorId) recalculateUserReputation(commentAuthorId).catch(() => {});

  return NextResponse.json({ liked: true });
}

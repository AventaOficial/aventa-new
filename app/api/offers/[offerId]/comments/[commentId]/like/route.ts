import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { recalculateUserReputation } from '@/lib/server/reputation';
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser';

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

  const authResult = await requireBearerCommunityUser(request);
  if ('error' in authResult) {
    return communityAuthFailureResponse(authResult);
  }
  const { user, supabase } = authResult;
  const userId = user.id;

  const { data: commentRow, error: commentErr } = await supabase
    .from('comments')
    .select('user_id, offer_id, status')
    .eq('id', cId)
    .maybeSingle();

  if (commentErr || !commentRow) {
    return NextResponse.json({ error: 'Comentario no encontrado' }, { status: 404 });
  }

  const row = commentRow as { user_id?: string; offer_id?: string; status?: string };
  if (row.offer_id !== oId) {
    return NextResponse.json({ error: 'Comentario no pertenece a esta oferta' }, { status: 404 });
  }
  if (row.status !== 'approved') {
    return NextResponse.json({ error: 'Comentario no disponible' }, { status: 403 });
  }

  const commentAuthorId = row.user_id;

  const { data: existing } = await supabase
    .from('comment_likes')
    .select('id')
    .eq('comment_id', cId)
    .eq('user_id', userId)
    .maybeSingle();

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

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string; commentId: string }> }
) {
  const { offerId, commentId } = await params;
  if (!offerId || !commentId || !isValidUuid(offerId) || !isValidUuid(commentId)) {
    return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await enforceRateLimitCustom(ip, 'reports');
  if (!rl.success) {
    return NextResponse.json({ error: 'Demasiados reportes. Espera un momento.' }, { status: 429 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'Inicia sesión para reportar' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';

  const { data: existing } = await supabase
    .from('offer_reports')
    .select('id')
    .eq('offer_id', offerId)
    .eq('reporter_id', user.id)
    .like('comment', `%[comment:${commentId}]%`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Ya reportaste este comentario.' }, { status: 409 });
  }

  const commentTag = `[comment:${commentId}] ${reason}`.trim();

  const { error } = await supabase.from('offer_reports').insert({
    offer_id: offerId,
    reporter_id: user.id,
    report_type: 'comment_ofensivo',
    comment: commentTag,
  });

  if (error) {
    console.error('[comment-report] insert:', error.message);
    return NextResponse.json({ error: 'Error al enviar el reporte' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

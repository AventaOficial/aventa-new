import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id?: string | null;
  image_url?: string | null;
  profiles?:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
};

function toComment(
  row: CommentRow,
  likeCount?: number,
  likedByMe?: boolean
) {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const username = prof?.display_name?.trim() || 'Usuario';
  return {
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    author: { username },
    parent_id: row.parent_id ?? null,
    image_url: row.image_url ?? null,
    like_count: likeCount ?? 0,
    liked_by_me: likedByMe ?? false,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  const offerId = (await params).offerId?.trim();
  if (!offerId || !isValidUuid(offerId)) {
    return NextResponse.json({ error: 'offerId required' }, { status: 400 });
  }

  const supabase = createServerClient();
  let list: CommentRow[];
  const { data: rows, error } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, parent_id, image_url, profiles:public_profiles_view!user_id(display_name)')
    .eq('offer_id', offerId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes('parent_id') || error.message?.includes('image_url') || error.message?.includes('column')) {
      const { data: fallback, error: err2 } = await supabase
        .from('comments')
        .select('id, content, created_at, user_id, profiles:public_profiles_view!user_id(display_name)')
        .eq('offer_id', offerId)
        .eq('status', 'approved')
        .order('created_at', { ascending: true });
      if (err2) {
        console.error('[comments] GET:', err2.message);
        return NextResponse.json({ error: 'Error loading comments' }, { status: 500 });
      }
      list = ((fallback ?? []) as CommentRow[]).map((r) => ({ ...r, parent_id: null, image_url: null }));
    } else {
      console.error('[comments] GET:', error.message);
      return NextResponse.json({ error: 'Error loading comments' }, { status: 500 });
    }
  } else {
    list = (rows ?? []) as CommentRow[];
  }
  const commentIds = list.map((c) => c.id);
  let likeCounts: Record<string, number> = {};
  let likedByMe: Record<string, boolean> = {};
  if (commentIds.length > 0) {
    try {
      const { data: likeRows } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .in('comment_id', commentIds);
      if (likeRows) {
        likeRows.forEach((r: { comment_id: string }) => {
          likeCounts[r.comment_id] = (likeCounts[r.comment_id] ?? 0) + 1;
        });
      }
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      if (token) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (url && anonKey) {
          const userRes = await fetch(`${url}/auth/v1/user`, {
            headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
          });
          if (userRes.ok) {
            const userData = await userRes.json().catch(() => null);
            const userId = userData?.id;
            if (userId) {
              const { data: myLikes } = await supabase
                .from('comment_likes')
                .select('comment_id')
                .eq('user_id', userId)
                .in('comment_id', commentIds);
              (myLikes ?? []).forEach((r: { comment_id: string }) => {
                likedByMe[r.comment_id] = true;
              });
            }
          }
        }
      }
    } catch {
      // comment_likes puede no existir aún
    }
  }

  const comments = list.map((row) =>
    toComment(row, likeCounts[row.id], likedByMe[row.id])
  );
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

  const supabase = createServerClient();
  try {
    const { data: ban } = await supabase
      .from('user_bans')
      .select('id')
      .eq('user_id', userId)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .maybeSingle();
    if (ban) {
      return NextResponse.json({ error: 'No puedes comentar. Tu cuenta está restringida.' }, { status: 403 });
    }
  } catch {
    // user_bans puede no existir aún
  }

  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.content === 'string' ? body.content.trim() : '';
  if (raw.length === 0 || raw.length > 280) {
    return NextResponse.json({ error: 'Contenido entre 1 y 280 caracteres' }, { status: 400 });
  }
  const parentId = typeof body?.parent_id === 'string' && isValidUuid(body.parent_id.trim()) ? body.parent_id.trim() : null;

  const insertPayload: { offer_id: string; user_id: string; content: string; parent_id?: string } = {
    offer_id: offerId,
    user_id: userId,
    content: raw,
  };
  if (parentId) insertPayload.parent_id = parentId;

  const { data: inserted, error: insertError } = await supabase
    .from('comments')
    .insert(insertPayload)
    .select('id, content, created_at, user_id, parent_id')
    .single();

  if (insertError) {
    console.error('[comments] POST insert:', insertError.message);
    return NextResponse.json({ error: 'Error al publicar comentario' }, { status: 500 });
  }

  const { data: withProfile } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, parent_id, image_url, profiles:public_profiles_view!user_id(display_name)')
    .eq('id', inserted.id)
    .single();

  const comment = withProfile ? toComment(withProfile as CommentRow, 0, false) : {
    id: inserted.id,
    content: inserted.content,
    created_at: inserted.created_at,
    author: { username: (userData?.user_metadata?.display_name?.trim() || userData?.email?.split('@')[0]) || 'Usuario' },
    parent_id: parentId,
    image_url: null,
    like_count: 0,
    liked_by_me: false,
  };
  return NextResponse.json(comment);
}

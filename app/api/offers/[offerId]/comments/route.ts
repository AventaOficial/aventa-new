import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { isValidUuid } from '@/lib/server/validateUuid';
import { REPUTATION_LEVEL_AUTO_APPROVE_COMMENTS } from '@/lib/server/reputation';
import { moderateCommentText } from '@/lib/moderation/commentProfanity';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser';
import { getCommentableOffer, validateCommentParent } from '@/lib/server/commentOfferGuard';

type CommentRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  parent_id?: string | null;
  image_url?: string | null;
  profiles?:
    | { display_name: string | null; avatar_url?: string | null }
    | { display_name: string | null; avatar_url?: string | null }[]
    | null;
};

function toComment(
  row: CommentRow,
  likeCount?: number,
  likedByMe?: boolean,
  viewerUserId?: string | null,
) {
  const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const username = prof?.display_name?.trim() || 'Usuario';
  const avatar_url = prof?.avatar_url?.trim() || null;
  return {
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    author: { username, avatar_url },
    is_own: viewerUserId ? row.user_id === viewerUserId : false,
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
    .select('id, content, created_at, user_id, parent_id, image_url, profiles:public_profiles_view!user_id(display_name, avatar_url)')
    .eq('offer_id', offerId)
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message?.includes('parent_id') || error.message?.includes('image_url') || error.message?.includes('column')) {
      const { data: fallback, error: err2 } = await supabase
        .from('comments')
        .select('id, content, created_at, user_id, profiles:public_profiles_view!user_id(display_name, avatar_url)')
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
  let viewerUserId: string | null = null;
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
            viewerUserId = userData?.id ?? null;
            if (viewerUserId) {
              const { data: myLikes } = await supabase
                .from('comment_likes')
                .select('comment_id')
                .eq('user_id', viewerUserId)
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
    toComment(row, likeCounts[row.id], likedByMe[row.id], viewerUserId)
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

  const authResult = await requireBearerCommunityUser(request);
  if ('error' in authResult) {
    return communityAuthFailureResponse(authResult);
  }
  const { user, supabase } = authResult;
  const userId = user.id;

  const offer = await getCommentableOffer(supabase, offerId);
  if (!offer) {
    return NextResponse.json(
      { error: 'Esta oferta no está disponible para comentarios.' },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.content === 'string' ? body.content.trim() : '';
  if (raw.length === 0 || raw.length > 280) {
    return NextResponse.json({ error: 'Contenido entre 1 y 280 caracteres' }, { status: 400 });
  }
  const parentId = typeof body?.parent_id === 'string' && isValidUuid(body.parent_id.trim()) ? body.parent_id.trim() : null;

  if (parentId) {
    const parentCheck = await validateCommentParent(supabase, offerId, parentId);
    if (!parentCheck.ok) {
      return NextResponse.json({ error: parentCheck.error }, { status: 400 });
    }
  }

  const imageRaw = typeof body?.image_url === 'string' ? body.image_url.trim() : '';
  const imageUrl = imageRaw
    ? (normalizeOfferImageUrl(imageRaw) ?? (imageRaw.startsWith('http') ? imageRaw.slice(0, 2048) : null))
    : null;
  if (imageRaw && !imageUrl) {
    return NextResponse.json({ error: 'La foto del comentario no es válida' }, { status: 400 });
  }

  const textMod = moderateCommentText(raw);
  if (textMod.verdict === 'block') {
    return NextResponse.json(
      { error: 'Tu comentario no se puede publicar. Evita insultos u ofensas.' },
      { status: 400 }
    );
  }

  let commentStatus: 'pending' | 'approved' = 'pending';
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('reputation_level')
      .eq('id', userId)
      .maybeSingle();
    const level = (profile as { reputation_level?: number } | null)?.reputation_level ?? 1;
    if (level >= REPUTATION_LEVEL_AUTO_APPROVE_COMMENTS && textMod.verdict === 'allow' && !imageUrl) {
      commentStatus = 'approved';
    }
  } catch {
    // si no existe la columna, mantener pending
  }

  // Foto o contenido en hold → siempre revisión humana
  if (imageUrl || textMod.verdict === 'hold') {
    commentStatus = 'pending';
  }

  const insertPayload: {
    offer_id: string;
    user_id: string;
    content: string;
    status?: string;
    parent_id?: string;
    image_url?: string;
  } = {
    offer_id: offerId,
    user_id: userId,
    content: raw,
    status: commentStatus,
  };
  if (parentId) insertPayload.parent_id = parentId;
  if (imageUrl) insertPayload.image_url = imageUrl;

  const { data: inserted, error: insertError } = await supabase
    .from('comments')
    .insert(insertPayload)
    .select('id, content, created_at, user_id, parent_id, image_url, status')
    .single();

  if (insertError) {
    // Schema sin image_url: reintentar sin foto
    if (imageUrl && (insertError.message?.includes('image_url') || insertError.message?.includes('column'))) {
      delete insertPayload.image_url;
      const retry = await supabase
        .from('comments')
        .insert(insertPayload)
        .select('id, content, created_at, user_id, parent_id, status')
        .single();
      if (retry.error) {
        console.error('[comments] POST insert:', retry.error.message);
        return NextResponse.json({ error: 'Error al publicar comentario' }, { status: 500 });
      }
      return NextResponse.json({
        comment: toComment({ ...(retry.data as CommentRow), image_url: null }, 0, false, userId),
        status: (retry.data as { status?: string })?.status ?? commentStatus,
        needsModeration: commentStatus === 'pending',
      });
    }
    console.error('[comments] POST insert:', insertError.message);
    return NextResponse.json({ error: 'Error al publicar comentario' }, { status: 500 });
  }

  const { data: withProfile } = await supabase
    .from('comments')
    .select('id, content, created_at, user_id, parent_id, image_url, profiles:public_profiles_view!user_id(display_name, avatar_url)')
    .eq('id', inserted.id)
    .single();

  const fallbackName =
    (user.user_metadata?.display_name?.trim() || user.email?.split('@')[0]) || 'Usuario';
  const fallbackAvatar =
    typeof user.user_metadata?.avatar_url === 'string' && user.user_metadata.avatar_url.trim()
      ? user.user_metadata.avatar_url.trim()
      : null;

  const comment = withProfile ? toComment(withProfile as CommentRow, 0, false, userId) : {
    id: inserted.id,
    content: inserted.content,
    created_at: inserted.created_at,
    author: { username: fallbackName, avatar_url: fallbackAvatar },
    is_own: true,
    parent_id: parentId,
    image_url: (inserted as { image_url?: string | null }).image_url ?? imageUrl,
    like_count: 0,
    liked_by_me: false,
  };
  return NextResponse.json({
    ...comment,
    status: commentStatus,
    needsModeration: commentStatus === 'pending',
  });
}

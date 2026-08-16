import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireTeamManagement } from '@/lib/server/requireAdmin';
import {
  isAllowedSocialUrl,
  parseSocialConfig,
  type SocialConfig,
  type SocialNetwork,
} from '@/lib/social/config';

function cleanUrl(value: unknown, network?: SocialNetwork): string {
  const url = typeof value === 'string' ? value.trim() : '';
  if (!url) return '';
  if (!isAllowedSocialUrl(url, network)) return '';
  return url;
}

export async function GET(request: Request) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const supabase = createServerClient();
  const { data } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
  return NextResponse.json({ social: parseSocialConfig((data as { value?: unknown } | null)?.value) });
}

export async function PATCH(request: Request) {
  const auth = await requireTeamManagement(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => ({}));
  const supabase = createServerClient();
  const { data: currentRow } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
  const current = parseSocialConfig((currentRow as { value?: unknown } | null)?.value);

  const networkRaw = body?.last_video_network;
  const network: SocialNetwork | '' =
    networkRaw === 'tiktok' || networkRaw === 'instagram' || networkRaw === 'x' ? networkRaw : current.last_video_network;

  const next: SocialConfig = {
    tiktok: body?.tiktok !== undefined ? cleanUrl(body.tiktok, 'tiktok') : current.tiktok,
    instagram: body?.instagram !== undefined ? cleanUrl(body.instagram, 'instagram') : current.instagram,
    x: body?.x !== undefined ? cleanUrl(body.x, 'x') : current.x,
    last_video_url: body?.last_video_url !== undefined ? cleanUrl(body.last_video_url) : current.last_video_url,
    last_video_title:
      typeof body?.last_video_title === 'string' ? body.last_video_title.trim().slice(0, 120) : current.last_video_title,
    last_video_network: network,
    last_video_at: current.last_video_at,
  };
  if (next.last_video_url && next.last_video_url !== current.last_video_url) {
    next.last_video_at = new Date().toISOString();
  }

  if (typeof body?.tiktok === 'string' && body.tiktok.trim() && !next.tiktok) {
    return NextResponse.json({ error: 'El enlace de TikTok no es válido.' }, { status: 400 });
  }
  if (typeof body?.instagram === 'string' && body.instagram.trim() && !next.instagram) {
    return NextResponse.json({ error: 'El enlace de Instagram no es válido.' }, { status: 400 });
  }
  if (typeof body?.x === 'string' && body.x.trim() && !next.x) {
    return NextResponse.json({ error: 'El enlace de X no es válido.' }, { status: 400 });
  }
  if (typeof body?.last_video_url === 'string' && body.last_video_url.trim() && !next.last_video_url) {
    return NextResponse.json({ error: 'El enlace del video debe ser de TikTok, Instagram o X.' }, { status: 400 });
  }

  const { error } = await supabase.from('app_config').upsert({ key: 'social_links', value: next }, { onConflict: 'key' });
  if (error) {
    console.error('[admin/social] upsert:', error.message);
    return NextResponse.json({ error: 'No se pudo guardar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, social: next });
}

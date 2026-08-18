import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireStaffHub } from '@/lib/server/requireStaff';
import { canAccessStaffDepartment } from '@/lib/staff/permissions';
import { buildMarketingPayload } from '@/lib/staff/buildMarketingPayload';
import {
  MARKETING_PIPELINE_KEY,
  parseMarketingPipeline,
  serializeMarketingPipeline,
  type MarketingContentStatus,
  type MarketingPipeline,
} from '@/lib/staff/marketingPipeline';
import { isAllowedSocialUrl, parseSocialConfig, type SocialNetwork } from '@/lib/social/config';

export async function GET(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessStaffDepartment(auth.role, 'marketing') && auth.role !== 'gerente' && auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const payload = await buildMarketingPayload(auth.displayName);
    return NextResponse.json(payload);
  } catch (e) {
    console.error('[staff/marketing]', e);
    return NextResponse.json({ error: 'No se pudo cargar marketing' }, { status: 500 });
  }
}

async function savePipeline(supabase: ReturnType<typeof createServerClient>, pipeline: MarketingPipeline) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key: MARKETING_PIPELINE_KEY, value: serializeMarketingPipeline(pipeline) }, { onConflict: 'key' });
  return error;
}

export async function PATCH(request: Request) {
  const auth = await requireStaffHub(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!canAccessStaffDepartment(auth.role, 'marketing') && auth.role !== 'gerente' && auth.role !== 'owner' && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const offerId = typeof body?.offerId === 'string' ? body.offerId.trim() : '';

  const supabase = createServerClient();
  const { data: row } = await supabase.from('app_config').select('value').eq('key', MARKETING_PIPELINE_KEY).maybeSingle();
  let pipeline = parseMarketingPipeline((row as { value?: unknown } | null)?.value);
  const nowIso = new Date().toISOString();

  if (action === 'setStatus') {
    const status = body?.status as MarketingContentStatus;
    if (!offerId || !['ideas', 'to_film', 'editing', 'published'].includes(status)) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }
    const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) : undefined;
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : undefined;
    const videoNetwork = body?.videoNetwork;
    const network: SocialNetwork | '' =
      videoNetwork === 'tiktok' || videoNetwork === 'instagram' || videoNetwork === 'x' ? videoNetwork : '';

    const idx = pipeline.items.findIndex((i) => i.offerId === offerId);
    const entry: MarketingPipeline['items'][number] = {
      offerId,
      status,
      selectedAt: idx >= 0 ? pipeline.items[idx].selectedAt : nowIso,
      publishedAt: status === 'published' ? nowIso : pipeline.items[idx]?.publishedAt,
      notes: notes ?? pipeline.items[idx]?.notes,
      videoUrl: videoUrl ?? pipeline.items[idx]?.videoUrl,
      videoNetwork: (network || pipeline.items[idx]?.videoNetwork || '') as '' | 'tiktok' | 'instagram' | 'x',
    };
    if (idx >= 0) pipeline.items[idx] = entry;
    else pipeline.items.unshift(entry);

    if (status === 'published' && videoUrl && isAllowedSocialUrl(videoUrl)) {
      const { data: socialRow } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
      const current = parseSocialConfig((socialRow as { value?: unknown } | null)?.value);
      const title = typeof body?.videoTitle === 'string' ? body.videoTitle.trim().slice(0, 120) : current.last_video_title;
      await supabase.from('app_config').upsert(
        {
          key: 'social_links',
          value: {
            ...current,
            last_video_url: videoUrl,
            last_video_title: title || current.last_video_title,
            last_video_network: network || current.last_video_network,
            last_video_at: nowIso,
          },
        },
        { onConflict: 'key' }
      );
    }
  } else if (action === 'remove') {
    if (!offerId) return NextResponse.json({ error: 'offerId requerido' }, { status: 400 });
    pipeline.items = pipeline.items.filter((i) => i.offerId !== offerId);
  } else if (action === 'registerVideo') {
    const videoUrl = typeof body?.videoUrl === 'string' ? body.videoUrl.trim() : '';
    const videoTitle = typeof body?.videoTitle === 'string' ? body.videoTitle.trim().slice(0, 120) : '';
    const networkRaw = body?.videoNetwork;
    const network: SocialNetwork | '' =
      networkRaw === 'tiktok' || networkRaw === 'instagram' || networkRaw === 'x' ? networkRaw : '';
    if (!videoUrl || !isAllowedSocialUrl(videoUrl, network || undefined)) {
      return NextResponse.json({ error: 'URL de video inválida' }, { status: 400 });
    }
    const { data: socialRow } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
    const current = parseSocialConfig((socialRow as { value?: unknown } | null)?.value);
    await supabase.from('app_config').upsert(
      {
        key: 'social_links',
        value: {
          ...current,
          last_video_url: videoUrl,
          last_video_title: videoTitle || current.last_video_title,
          last_video_network: network || current.last_video_network,
          last_video_at: nowIso,
        },
      },
      { onConflict: 'key' }
    );
    pipeline.updatedAt = nowIso;
    pipeline.updatedBy = auth.user.id;
    const err = await savePipeline(supabase, pipeline);
    if (err) return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json({ error: 'action inválido' }, { status: 400 });
  }

  pipeline.updatedAt = nowIso;
  pipeline.updatedBy = auth.user.id;
  const err = await savePipeline(supabase, pipeline);
  if (err) return NextResponse.json({ error: 'No se pudo guardar pipeline' }, { status: 500 });

  return NextResponse.json({ ok: true, pipeline });
}

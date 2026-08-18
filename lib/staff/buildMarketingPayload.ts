import { createServerClient } from '@/lib/supabase/server';
import {
  discountPercent,
  isFilmWorthyOffer,
  parseStaffWorkBoard,
  seedDefaultTasks,
  taskCompletionPct,
  type StaffFilmCandidate,
  type StaffWorkBoard,
} from '@/lib/staff/workBoard';
import { staffTasksConfigKey } from '@/lib/staff/departments';
import {
  parseMarketingPipeline,
  scorePotential,
  type MarketingContentCard,
  type MarketingContentStatus,
  type MarketingPipeline,
  MARKETING_PIPELINE_KEY,
} from '@/lib/staff/marketingPipeline';
import { parseSocialConfig, type SocialConfig } from '@/lib/social/config';

async function loadFilmCandidates(limit = 32): Promise<StaffFilmCandidate[]> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('offers')
    .select('id, title, store, price, original_price, image_url, offer_url, created_at')
    .in('status', ['approved', 'published'])
    .is('deleted_at', null)
    .or(`expires_at.is.null,expires_at.gte.${now}`)
    .order('created_at', { ascending: false })
    .limit(60);

  const film: StaffFilmCandidate[] = [];
  for (const row of data ?? []) {
    const price = Number((row as { price?: number }).price ?? 0);
    const originalPriceRaw = (row as { original_price?: number | null }).original_price;
    const originalPrice = originalPriceRaw == null ? null : Number(originalPriceRaw);
    const title = String((row as { title?: string }).title ?? '');
    const offerUrl = String((row as { offer_url?: string }).offer_url ?? '');
    if (!isFilmWorthyOffer({ price, originalPrice, title, offerUrl })) continue;
    film.push({
      id: String((row as { id: string }).id),
      title,
      store: String((row as { store?: string }).store ?? ''),
      price,
      originalPrice,
      discountPercent: discountPercent(price, originalPrice),
      imageUrl: (row as { image_url?: string | null }).image_url ?? null,
      offerUrl,
      createdAt: String((row as { created_at?: string }).created_at ?? now),
    });
    if (film.length >= limit) break;
  }
  return film;
}

async function loadClicks7d(offerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (offerIds.length === 0) return map;
  const supabase = createServerClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('offer_events')
    .select('offer_id')
    .in('offer_id', offerIds)
    .eq('event_type', 'outbound')
    .gte('created_at', since);

  for (const row of data ?? []) {
    const id = String((row as { offer_id?: string }).offer_id ?? '');
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

async function loadMarketingPipeline(): Promise<MarketingPipeline> {
  const supabase = createServerClient();
  const { data } = await supabase.from('app_config').select('value').eq('key', MARKETING_PIPELINE_KEY).maybeSingle();
  return parseMarketingPipeline((data as { value?: unknown } | null)?.value);
}

async function loadMarketingBoard(): Promise<StaffWorkBoard> {
  const supabase = createServerClient();
  const key = staffTasksConfigKey('marketing');
  const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  let board = parseStaffWorkBoard(data?.value, 'marketing');
  if (board.tasks.length === 0) {
    board = { ...board, tasks: seedDefaultTasks('marketing') };
  }
  return board;
}

async function loadLastVideo(): Promise<Pick<SocialConfig, 'last_video_url' | 'last_video_title' | 'last_video_network' | 'last_video_at'>> {
  const supabase = createServerClient();
  const { data } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
  const social = parseSocialConfig((data as { value?: unknown } | null)?.value);
  return {
    last_video_url: social.last_video_url,
    last_video_title: social.last_video_title,
    last_video_network: social.last_video_network,
    last_video_at: social.last_video_at,
  };
}

export type MarketingPayload = {
  generatedAt: string;
  greeting: string;
  board: StaffWorkBoard;
  taskPct: number;
  pipeline: MarketingPipeline;
  candidates: MarketingContentCard[];
  lastVideo: Pick<SocialConfig, 'last_video_url' | 'last_video_title' | 'last_video_network' | 'last_video_at'>;
};

export function filterCardsByTab(
  cards: MarketingContentCard[],
  tab: MarketingContentStatus | 'all' | 'performance',
): MarketingContentCard[] {
  if (tab === 'all' || tab === 'ideas') {
    return cards.filter((c) => c.pipelineStatus == null || c.pipelineStatus === 'ideas');
  }
  if (tab === 'performance') {
    return cards
      .filter((c) => c.pipelineStatus === 'published')
      .sort((a, b) => (b.clicks7d ?? 0) - (a.clicks7d ?? 0));
  }
  return cards.filter((c) => c.pipelineStatus === tab);
}

export async function buildMarketingPayload(displayName: string | null): Promise<MarketingPayload> {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const name = displayName?.trim() || 'equipo';

  const [film, pipeline, board, lastVideo] = await Promise.all([
    loadFilmCandidates(),
    loadMarketingPipeline(),
    loadMarketingBoard(),
    loadLastVideo(),
  ]);

  const pipelineMap = new Map(pipeline.items.map((i) => [i.offerId, i]));
  const filmIds = film.map((f) => f.id);
  const clicks = await loadClicks7d(filmIds);

  const candidates: MarketingContentCard[] = film.map((f) => {
    const entry = pipelineMap.get(f.id);
    const clicks7d = clicks.get(f.id) ?? null;
    return {
      ...f,
      clicks7d,
      pipelineStatus: entry?.status ?? null,
      potential: scorePotential(f.discountPercent, clicks7d),
      pipelineNotes: entry?.notes,
      publishedAt: entry?.publishedAt,
      videoUrl: entry?.videoUrl,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    greeting: `${time}, ${name}. Aquí está tu materia prima para contenido.`,
    board,
    taskPct: taskCompletionPct(board.tasks),
    pipeline,
    candidates,
    lastVideo,
  };
}

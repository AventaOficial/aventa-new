import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import {
  claimNextModerationOffer,
  type ClaimSourceTab,
} from '@/lib/moderation/claimNextModerationOffer';
import { moderationMaxLevelForRole } from '@/lib/moderation/moderationMaxLevelForRole';
import { recordClaimLatencyMs } from '@/lib/moderation/claimLatencyTracker';

function parseSourceTab(value: unknown): ClaimSourceTab {
  if (value === 'bot' || value === 'users' || value === 'all') return value;
  return 'all';
}

/**
 * POST — reclama atómicamente la siguiente oferta elegible para el moderador.
 * Body opcional: { releaseOfferId?, excludeOfferIds?, sourceTab? }
 */
export async function POST(request: Request) {
  const auth = await requireModeration(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => ({}));
  const releaseOfferId =
    typeof body?.releaseOfferId === 'string' ? body.releaseOfferId : null;
  const excludeOfferIds = Array.isArray(body?.excludeOfferIds)
    ? body.excludeOfferIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined;
  const sourceTab = parseSourceTab(body?.sourceTab);
  const maxLevel = moderationMaxLevelForRole(auth.role);

  const started = Date.now();

  try {
    const supabase = createServerClient();
    const result = await claimNextModerationOffer(supabase, auth.user.id, {
      releaseOfferId,
      excludeOfferIds,
      sourceTab,
      maxLevel,
    });

    const claimLatencyMs = Date.now() - started;
    recordClaimLatencyMs(claimLatencyMs);

    return NextResponse.json({
      ok: true,
      claimed: result.claimed,
      offer: result.offer,
      stats: result.stats,
      claimLatencyMs,
      maxLevel,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudo reclamar la siguiente oferta';
    console.error('[moderation/claim-next]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

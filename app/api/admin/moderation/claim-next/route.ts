import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireModeration } from '@/lib/server/requireAdmin';
import {
  claimNextModerationOffer,
  type ClaimSourceTab,
} from '@/lib/moderation/claimNextModerationOffer';
import { moderationMaxLevelForRole } from '@/lib/moderation/moderationMaxLevelForRole';
import { recordClaimLatencyMs } from '@/lib/moderation/claimLatencyTracker';
import { recordModerationOutcomeFireAndForget } from '@/lib/moderation/outcomes';

function parseSourceTab(value: unknown): ClaimSourceTab {
  if (value === 'bot' || value === 'users' || value === 'all') return value;
  return 'all';
}

/**
 * POST — reclama atómicamente la siguiente oferta elegible para el moderador.
 * Body opcional: { releaseOfferId?, excludeOfferIds?, sourceTab?, preferOfferId? }
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
  const preferOfferId = typeof body?.preferOfferId === 'string' ? body.preferOfferId : null;
  const maxLevel = moderationMaxLevelForRole(auth.role);

  const started = Date.now();

  try {
    const supabase = createServerClient();
    const result = await claimNextModerationOffer(supabase, auth.user.id, {
      releaseOfferId,
      excludeOfferIds,
      sourceTab,
      maxLevel,
      preferOfferId,
    });

    const claimLatencyMs = Date.now() - started;
    recordClaimLatencyMs(claimLatencyMs);

    if (result.claimed && result.offer && typeof result.offer.id === 'string') {
      const o = result.offer;
      recordModerationOutcomeFireAndForget(
        {
          offer: {
            id: o.id as string,
            created_at: (o.created_at as string | null | undefined) ?? null,
            image_url: (o.image_url as string | null | undefined) ?? null,
            price: typeof o.price === 'number' ? o.price : null,
            original_price: typeof o.original_price === 'number' ? o.original_price : null,
            offer_url: (o.offer_url as string | null | undefined) ?? null,
            link_mod_ok: (o.link_mod_ok as boolean | null | undefined) ?? null,
            is_bot: o.is_bot === true,
            moderator_comment: (o.moderator_comment as string | null | undefined) ?? null,
            description: (o.description as string | null | undefined) ?? null,
            bot_meta: o.bot_meta,
          },
          decision: 'claim',
          moderatorId: auth.user.id,
        },
        { supabase },
      );
    }

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

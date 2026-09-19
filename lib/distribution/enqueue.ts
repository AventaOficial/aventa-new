import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  DISTRIBUTION_DEFAULT_VERSION,
  isDistributionEngineEnabled,
} from './constants';
import {
  assertNotPendingForDistribution,
  evaluateDistributionEligibility,
} from './eligibility';
import { appendDistributionEvent } from './events';
import { buildDistributionIdempotencyKey } from './idempotency';
import { resolveEligibleDestinations } from './routing';
import type {
  DistributionDestinationRow,
  DistributionOfferSnapshot,
  EnqueueDistributionResult,
} from './types';

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique');
}

function mapDestinationRow(raw: Record<string, unknown>): DistributionDestinationRow {
  return {
    id: String(raw.id),
    brand_id: String(raw.brand_id),
    provider: raw.provider as DistributionDestinationRow['provider'],
    slug: String(raw.slug),
    display_name: String(raw.display_name),
    external_destination_key: String(raw.external_destination_key),
    credential_ref: (raw.credential_ref as string | null) ?? null,
    status: raw.status as DistributionDestinationRow['status'],
    kind: raw.kind as DistributionDestinationRow['kind'],
    category_ids: Array.isArray(raw.category_ids)
      ? (raw.category_ids as string[])
      : [],
    tracking_campaign_key: (raw.tracking_campaign_key as string | null) ?? null,
  };
}

/**
 * Post-approval enqueue: create pending publications for eligible destinations.
 * Does NOT call Telegram/WhatsApp. Does NOT modify offers.status.
 * C2: evaluateDistributionEligibility is the sole status authority (DB).
 */
export async function enqueueDistributionForApprovedOffer(
  offerId: string,
  options?: {
    supabase?: SupabaseClient;
    distributionVersion?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<EnqueueDistributionResult> {
  const env = options?.env ?? process.env;
  if (!isDistributionEngineEnabled(env)) {
    return { ok: true, skipped: 'flag_disabled' };
  }

  const supabase = options?.supabase ?? createServerClient();
  const version = options?.distributionVersion ?? DISTRIBUTION_DEFAULT_VERSION;

  // C2 single authority — loads offers.status from DB; pending cannot pass.
  const eligibility = await evaluateDistributionEligibility({
    offerId,
    supabase,
    env,
  });
  if (!eligibility.eligible) {
    return {
      ok: true,
      skipped: 'not_distributable',
      reason: `${eligibility.decision}:${eligibility.reason}`,
    };
  }

  // Defense in depth — never proceed if status somehow still pending.
  assertNotPendingForDistribution(eligibility.status);

  const { data: offerRow, error: offerErr } = await supabase
    .from('offers')
    .select('id, status, expires_at, category, coupons, bank_coupon')
    .eq('id', offerId)
    .maybeSingle();

  if (offerErr) {
    console.error('[distribution] offer load failed:', offerErr.message);
    return { ok: false, error: offerErr.message };
  }
  if (!offerRow) {
    return { ok: true, skipped: 'not_distributable', reason: 'OFFER_MISSING:offer_missing' };
  }

  const offer = offerRow as DistributionOfferSnapshot;
  assertNotPendingForDistribution(offer.status);

  const { data: destRows, error: destErr } = await supabase
    .from('distribution_destinations')
    .select(
      'id, brand_id, provider, slug, display_name, external_destination_key, credential_ref, status, kind, category_ids, tracking_campaign_key',
    )
    .eq('status', 'active');

  if (destErr) {
    // Table missing / not migrated — fail soft; do not break moderation.
    console.error('[distribution] destinations load failed:', destErr.message);
    return { ok: false, error: destErr.message };
  }

  const destinations = (destRows ?? []).map((r) =>
    mapDestinationRow(r as Record<string, unknown>),
  );
  const eligible = resolveEligibleDestinations({ offer, destinations });
  if (eligible.length === 0) {
    return { ok: true, skipped: 'no_destinations' };
  }

  let created = 0;
  let reused = 0;
  const publicationIds: string[] = [];

  for (const dest of eligible) {
    const idempotencyKey = buildDistributionIdempotencyKey({
      offerId,
      destinationId: dest.id,
      distributionVersion: version,
    });
    const campaignKey = dest.tracking_campaign_key ?? dest.slug;

    const insertPayload = {
      offer_id: offerId,
      destination_id: dest.id,
      distribution_version: version,
      idempotency_key: idempotencyKey,
      status: 'pending' as const,
      provider: dest.provider,
      external_destination_key: dest.external_destination_key,
      tracking_campaign_key: campaignKey,
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('distribution_publications')
      .insert(insertPayload)
      .select('id')
      .maybeSingle();

    if (!insertErr && inserted?.id) {
      created += 1;
      publicationIds.push(String(inserted.id));
      await appendDistributionEvent(supabase, {
        publicationId: String(inserted.id),
        eventType: 'publication_created',
        meta: {
          offer_id: offerId,
          destination_id: dest.id,
          provider: dest.provider,
          distribution_version: version,
          eligibility_decision: eligibility.decision,
        },
      });
      continue;
    }

    if (isUniqueViolation(insertErr)) {
      const { data: existing } = await supabase
        .from('distribution_publications')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existing?.id) {
        reused += 1;
        publicationIds.push(String(existing.id));
      } else {
        reused += 1;
      }
      continue;
    }

    if (insertErr) {
      console.error('[distribution] publication insert failed:', insertErr.message);
      return { ok: false, error: insertErr.message };
    }
  }

  return { ok: true, created, reused, publicationIds };
}

/**
 * Fire-and-forget from moderate-offer. Never throws to caller.
 * Never blocks approval. Never calls external providers.
 */
export function enqueueDistributionForApprovedOfferFireAndForget(
  offerId: string,
  options?: { supabase?: SupabaseClient },
): void {
  void enqueueDistributionForApprovedOffer(offerId, options).catch((err) => {
    console.error('[distribution] enqueue failed:', err);
  });
}

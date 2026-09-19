import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { isDistributionEngineEnabled } from './constants';
import { assertStagingTelegramCredentialRef, resolveDeploymentSurface } from './cronSafety';
import {
  DISTRIBUTION_MAX_ATTEMPTS,
  claimNextDistributionPublications,
  distributionBackoffMinutes,
  type ClaimedPublication,
} from './claim';
import { evaluateDistributionEligibilityFromSnapshot } from './eligibility';
import { appendDistributionEvent } from './events';
import { getDistributionProviderAdapter } from './providers/registry';
import type { DistributionProviderAdapter } from './providers/types';
import { renderTelegramOfferMessage } from './render/telegramMessage';
import { buildDistributionHopUrl } from './siteUrl';
import type { DistributionProvider } from './types';

export type DrainResult = {
  ok: true;
  skipped?: 'flag_disabled';
  claimed: number;
  published: number;
  retryable: number;
  failed: number;
  blockedCredential: number;
};

async function loadDestination(
  supabase: SupabaseClient,
  destinationId: string,
): Promise<{
  id: string;
  status: string;
  credential_ref: string | null;
  external_destination_key: string;
  display_name: string;
  provider: string;
} | null> {
  const { data } = await supabase
    .from('distribution_destinations')
    .select('id, status, credential_ref, external_destination_key, display_name, provider')
    .eq('id', destinationId)
    .maybeSingle();
  return (data as never) ?? null;
}

async function loadOfferForRender(
  supabase: SupabaseClient,
  offerId: string,
): Promise<{
  id: string;
  title: string;
  store: string | null;
  price: number | null;
  original_price: number | null;
  image_url: string | null;
  status: string;
  expires_at: string | null;
} | null> {
  const { data } = await supabase
    .from('offers')
    .select('id, title, store, price, original_price, image_url, status, expires_at')
    .eq('id', offerId)
    .maybeSingle();
  return (data as never) ?? null;
}

function isOfferStillLive(offer: {
  status: string;
  expires_at: string | null;
}, nowMs: number): boolean {
  // C2: mid-drain re-check uses same snapshot authority (flag already gated at drain entry).
  const r = evaluateDistributionEligibilityFromSnapshot(
    { id: 'drain', status: offer.status, expires_at: offer.expires_at },
    { nowMs, requireEngineEnabled: false },
  );
  return r.eligible;
}

async function markRetryable(
  supabase: SupabaseClient,
  pub: ClaimedPublication,
  code: string,
  message: string,
): Promise<'retryable' | 'failed'> {
  const attempts = pub.attempt_count;
  const now = Date.now();
  if (attempts >= DISTRIBUTION_MAX_ATTEMPTS) {
    await supabase
      .from('distribution_publications')
      .update({
        status: 'failed',
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        updated_at: new Date(now).toISOString(),
      })
      .eq('id', pub.id)
      .eq('status', 'publishing');
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_failed',
      meta: { code, message: message.slice(0, 200), attempts },
    });
    return 'failed';
  }

  const delayMin = distributionBackoffMinutes(attempts);
  const next = new Date(now + delayMin * 60_000).toISOString();
  await supabase
    .from('distribution_publications')
    .update({
      status: 'retryable',
      next_attempt_at: next,
      last_error_code: code,
      last_error_message: message.slice(0, 500),
      updated_at: new Date(now).toISOString(),
    })
    .eq('id', pub.id)
    .eq('status', 'publishing');
  await appendDistributionEvent(supabase, {
    publicationId: pub.id,
    eventType: 'publication_retryable',
    meta: { code, next_attempt_at: next, attempts },
  });
  return 'retryable';
}

async function processOne(
  supabase: SupabaseClient,
  pub: ClaimedPublication,
  options: {
    env: NodeJS.ProcessEnv;
    adapters?: Partial<Record<DistributionProvider, DistributionProviderAdapter>>;
    fetchImpl?: typeof fetch;
    nowMs: number;
  },
): Promise<'published' | 'retryable' | 'failed' | 'blocked'> {
  const dest = await loadDestination(supabase, pub.destination_id);
  if (!dest || dest.status !== 'active') {
    await supabase
      .from('distribution_publications')
      .update({
        status: 'cancelled',
        last_error_code: 'destination_disabled',
        last_error_message: 'destination missing or not active',
        updated_at: new Date(options.nowMs).toISOString(),
      })
      .eq('id', pub.id)
      .eq('status', 'publishing');
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_failed',
      meta: { phase: 'cancel', reason: 'destination_disabled' },
    });
    return 'failed';
  }

  if (resolveDeploymentSurface(options.env) === 'staging') {
    const cred = assertStagingTelegramCredentialRef(dest.credential_ref);
    if (!cred.ok) {
      await markRetryable(supabase, pub, cred.reason, 'staging credential_ref rejected');
      return 'blocked';
    }
  }

  const offer = await loadOfferForRender(supabase, pub.offer_id);
  if (!offer || !isOfferStillLive(offer, options.nowMs)) {
    await supabase
      .from('distribution_publications')
      .update({
        status: 'cancelled',
        last_error_code: 'offer_not_live',
        last_error_message: 'offer not approved/published or expired',
        updated_at: new Date(options.nowMs).toISOString(),
      })
      .eq('id', pub.id)
      .eq('status', 'publishing');
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_failed',
      meta: { phase: 'cancel', reason: 'offer_not_live' },
    });
    return 'failed';
  }

  // Idempotency: already have provider message id from prior ambiguous success
  if (pub.external_message_id) {
    await supabase
      .from('distribution_publications')
      .update({
        status: 'published',
        published_at: new Date(options.nowMs).toISOString(),
        updated_at: new Date(options.nowMs).toISOString(),
      })
      .eq('id', pub.id)
      .eq('status', 'publishing');
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_published',
      meta: { reused_external_message_id: true },
    });
    return 'published';
  }

  const provider = pub.provider as DistributionProvider;
  const adapter = getDistributionProviderAdapter(provider, {
    env: options.env,
    fetchImpl: options.fetchImpl,
    overrides: options.adapters,
  });
  if (!adapter) {
    return markRetryable(supabase, pub, 'provider_unsupported', `no adapter for ${provider}`);
  }

  const ctaUrl = buildDistributionHopUrl(pub.id, options.env);
  const rendered = renderTelegramOfferMessage({
    offer: {
      id: offer.id,
      title: offer.title,
      store: offer.store,
      price: offer.price,
      original_price: offer.original_price,
      image_url: offer.image_url,
    },
    ctaUrl,
    destinationDisplayName: dest.display_name,
  });

  await appendDistributionEvent(supabase, {
    publicationId: pub.id,
    eventType: 'publication_attempted',
    meta: { phase: 'publish_attempt', provider },
  });

  const result = await adapter.publish({
    externalDestinationKey: dest.external_destination_key,
    credentialRef: dest.credential_ref,
    text: rendered.text,
    imageUrl: rendered.imageUrl,
    parseMode: rendered.parseMode,
  });

  if (result.ok) {
    await supabase
      .from('distribution_publications')
      .update({
        status: 'published',
        external_message_id: result.externalMessageId,
        published_at: new Date(options.nowMs).toISOString(),
        updated_at: new Date(options.nowMs).toISOString(),
        last_error_code: null,
        last_error_message: null,
      })
      .eq('id', pub.id)
      .eq('status', 'publishing');
    await appendDistributionEvent(supabase, {
      publicationId: pub.id,
      eventType: 'publication_published',
      meta: { external_message_id: result.externalMessageId, provider: result.provider },
    });
    return 'published';
  }

  if (result.blockedExternalCredential) {
    await markRetryable(supabase, pub, result.code, result.message);
    return 'blocked';
  }

  if (result.retryable) {
    return markRetryable(supabase, pub, result.code, result.message);
  }

  await supabase
    .from('distribution_publications')
    .update({
      status: 'failed',
      last_error_code: result.code,
      last_error_message: result.message.slice(0, 500),
      updated_at: new Date(options.nowMs).toISOString(),
    })
    .eq('id', pub.id)
    .eq('status', 'publishing');
  await appendDistributionEvent(supabase, {
    publicationId: pub.id,
    eventType: 'publication_failed',
    meta: { code: result.code, message: result.message.slice(0, 200) },
  });
  return 'failed';
}

/**
 * Drain pending/retryable publications. Fail-closed when flag OFF.
 * Never called synchronously from moderate-offer.
 */
export async function drainDistributionPublications(options?: {
  supabase?: SupabaseClient;
  env?: NodeJS.ProcessEnv;
  limit?: number;
  adapters?: Partial<Record<DistributionProvider, DistributionProviderAdapter>>;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<DrainResult> {
  const env = options?.env ?? process.env;
  if (!isDistributionEngineEnabled(env)) {
    return {
      ok: true,
      skipped: 'flag_disabled',
      claimed: 0,
      published: 0,
      retryable: 0,
      failed: 0,
      blockedCredential: 0,
    };
  }

  const supabase = options?.supabase ?? createServerClient();
  const nowMs = options?.nowMs ?? Date.now();
  const claimed = await claimNextDistributionPublications(supabase, {
    limit: options?.limit,
    nowMs,
  });

  let published = 0;
  let retryable = 0;
  let failed = 0;
  let blockedCredential = 0;

  for (const pub of claimed) {
    const outcome = await processOne(supabase, pub, {
      env,
      adapters: options?.adapters,
      fetchImpl: options?.fetchImpl,
      nowMs,
    });
    if (outcome === 'published') published += 1;
    else if (outcome === 'retryable') retryable += 1;
    else if (outcome === 'blocked') blockedCredential += 1;
    else failed += 1;
  }

  return {
    ok: true,
    claimed: claimed.length,
    published,
    retryable,
    failed,
    blockedCredential,
  };
}

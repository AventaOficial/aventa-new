import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  findDuplicateOfferByUrl,
  strongProductFingerprintForUrl,
  type DuplicateOfferMatch,
} from '@/lib/offers/findDuplicateOffer';
import type { DealCheckStatus } from '@/lib/verifier/types';

export type ShadowDuplicateLookup = {
  status: DealCheckStatus;
  detail: string;
  matchId: string | null;
};

export type DuplicateFinder = (
  supabase: SupabaseClient,
  normalizedOfferUrl: string
) => Promise<DuplicateOfferMatch | null>;

export type DuplicateShadowContext = {
  cache: Map<string, ShadowDuplicateLookup>;
  supabase: SupabaseClient | null;
};

/** Un cliente y un cache por corrida de ingest. Evita N clientes y repeats. */
export function createDuplicateShadowContext(): DuplicateShadowContext {
  let supabase: SupabaseClient | null = null;
  try {
    supabase = createServerClient();
  } catch {
    supabase = null;
  }
  return { cache: new Map(), supabase };
}

function cacheKey(url: string, fingerprint: string | null): string {
  return fingerprint ?? `url:${url}`;
}

/**
 * Adapta el detector existente al snapshot shadow.
 * No reemplaza findDuplicateOfferByUrl. No se pasa al Deal Verifier.
 */
export async function lookupDuplicateForShadow(
  supabase: SupabaseClient | null,
  normalizedOfferUrl: string,
  opts?: {
    cache?: Map<string, ShadowDuplicateLookup>;
    find?: DuplicateFinder;
  }
): Promise<ShadowDuplicateLookup> {
  const url = (normalizedOfferUrl ?? '').trim();
  if (!url) {
    return { status: 'unknown', detail: 'URL vacía para duplicate check', matchId: null };
  }

  const fingerprint = strongProductFingerprintForUrl(url);
  const key = cacheKey(url, fingerprint);
  const cached = opts?.cache?.get(key);
  if (cached) return cached;

  if (!fingerprint) {
    const result: ShadowDuplicateLookup = {
      status: 'unknown',
      detail: 'Sin fingerprint fuerte (ASIN/ML id); duplicate no verificable',
      matchId: null,
    };
    opts?.cache?.set(key, result);
    return result;
  }

  if (!supabase && !opts?.find) {
    const result: ShadowDuplicateLookup = {
      status: 'unknown',
      detail: 'duplicate_check_unavailable',
      matchId: null,
    };
    opts?.cache?.set(key, result);
    return result;
  }

  try {
    const finder = opts?.find ?? findDuplicateOfferByUrl;
    const match = await finder(supabase as SupabaseClient, url);
    const result: ShadowDuplicateLookup = match
      ? {
          status: 'fail',
          detail: `Duplicado de oferta existente (${match.id})`,
          matchId: match.id,
        }
      : {
          status: 'pass',
          detail: 'Sin duplicado en pre-check',
          matchId: null,
        };
    opts?.cache?.set(key, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: ShadowDuplicateLookup = {
      status: 'unknown',
      detail: `duplicate_check_error: ${message.slice(0, 120)}`,
      matchId: null,
    };
    opts?.cache?.set(key, result);
    return result;
  }
}

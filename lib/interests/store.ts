import type { SupabaseClient } from '@supabase/supabase-js';
import { INTEREST_LIMITS, interestIdentity, normalizeInterestDraft, type InterestDraft, type NormalizedInterest } from '@/lib/interests/normalize';
import {
  claimDeliveryKeys,
  deliveryKey,
  selectDigestMatches,
  settleDeliveries,
  type DigestKind,
} from '@/lib/interests/delivery';
import { matchInterestsToOffers, pickDiscoveryOffers, type MatchableOffer } from '@/lib/interests/match';

export type StoredInterest = NormalizedInterest & { id: string; userId: string; updatedAt: string };

type InterestRow = {
  id: string;
  user_id: string;
  label: string;
  label_norm: string;
  brand: string | null;
  brand_norm: string | null;
  model: string | null;
  model_norm: string | null;
  category: string | null;
  aliases: string[] | null;
  alias_norms: string[] | null;
  cadence: NormalizedInterest['cadence'];
  notify: boolean;
  updated_at: string;
};

function fromRow(row: InterestRow): StoredInterest {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    labelNorm: row.label_norm,
    brand: row.brand,
    brandNorm: row.brand_norm,
    model: row.model,
    modelNorm: row.model_norm,
    category: (row.category as StoredInterest['category']) ?? null,
    aliases: row.aliases ?? [],
    aliasNorms: row.alias_norms ?? [],
    cadence: row.cadence,
    notify: row.notify,
    updatedAt: row.updated_at,
  };
}

function toInsert(userId: string, interest: NormalizedInterest) {
  return {
    user_id: userId,
    label: interest.label,
    label_norm: interest.labelNorm,
    brand: interest.brand,
    brand_norm: interest.brandNorm,
    model: interest.model,
    model_norm: interest.modelNorm,
    category: interest.category,
    aliases: interest.aliases,
    alias_norms: interest.aliasNorms,
    cadence: interest.cadence,
    notify: interest.notify,
    updated_at: new Date().toISOString(),
  };
}

export async function listInterests(supabase: SupabaseClient, userId: string): Promise<StoredInterest[]> {
  const { data, error } = await supabase
    .from('user_product_interests')
    .select('id, user_id, label, label_norm, brand, brand_norm, model, model_norm, category, aliases, alias_norms, cadence, notify, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(INTEREST_LIMITS.maxPerUser);
  if (error) throw error;
  return ((data ?? []) as InterestRow[]).map(fromRow);
}

export async function insertInterest(
  supabase: SupabaseClient,
  userId: string,
  draft: InterestDraft,
): Promise<{ interest: StoredInterest } | { error: string; status: number }> {
  const normalized = normalizeInterestDraft(draft);
  if ('error' in normalized) return { error: normalized.error, status: 400 };
  const existing = await listInterests(supabase, userId);
  if (existing.length >= INTEREST_LIMITS.maxPerUser) {
    return { error: 'Llegaste al límite de 30 intereses.', status: 400 };
  }
  const identity = interestIdentity(normalized);
  if (existing.some((row) => interestIdentity(row) === identity)) {
    return { error: 'Ese interés ya está en tu lista.', status: 409 };
  }
  const { data, error } = await supabase
    .from('user_product_interests')
    .insert(toInsert(userId, normalized))
    .select('id, user_id, label, label_norm, brand, brand_norm, model, model_norm, category, aliases, alias_norms, cadence, notify, updated_at')
    .single();
  if (error) {
    if (error.code === '23505') return { error: 'Ese interés ya está en tu lista.', status: 409 };
    if (error.code === '23514') return { error: 'Llegaste al límite de 30 intereses.', status: 400 };
    throw error;
  }
  return { interest: fromRow(data as InterestRow) };
}

export async function updateInterest(
  supabase: SupabaseClient,
  userId: string,
  interestId: string,
  draft: InterestDraft,
): Promise<{ interest: StoredInterest } | { error: string; status: number }> {
  const normalized = normalizeInterestDraft(draft);
  if ('error' in normalized) return { error: normalized.error, status: 400 };
  const { data, error } = await supabase
    .from('user_product_interests')
    .update(toInsert(userId, normalized))
    .eq('id', interestId)
    .eq('user_id', userId)
    .select('id, user_id, label, label_norm, brand, brand_norm, model, model_norm, category, aliases, alias_norms, cadence, notify, updated_at')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { error: 'Ese interés ya está en tu lista.', status: 409 };
    throw error;
  }
  if (!data) return { error: 'No encontramos ese interés.', status: 404 };
  return { interest: fromRow(data as InterestRow) };
}

export async function deleteInterest(supabase: SupabaseClient, userId: string, interestId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_product_interests')
    .delete()
    .eq('id', interestId)
    .eq('user_id', userId)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

const CANDIDATE_COLUMNS =
  'id, title, category, status, expires_at, upvotes_count, ranking_blend';

export async function loadMatchCandidates(supabase: SupabaseClient, now: Date): Promise<MatchableOffer[]> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('offers')
    .select(CANDIDATE_COLUMNS)
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`)
    .gte('created_at', since)
    .order('ranking_blend', { ascending: false })
    .limit(60);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ''),
    category: (row.category as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    upvotes: typeof row.upvotes_count === 'number' ? row.upvotes_count : 0,
    rankingBlend: typeof row.ranking_blend === 'number' ? row.ranking_blend : 0,
  }));
}

export function buildInterestView(interests: readonly StoredInterest[], offers: readonly MatchableOffer[], now: Date) {
  const matches = matchInterestsToOffers(interests, offers, now).slice(0, INTEREST_LIMITS.personalInFeed);
  const matchedIds = new Set(matches.map((match) => match.offerId));
  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  return {
    matches: matches.flatMap((match) => {
      const offer = byId.get(match.offerId);
      return offer ? [{ ...offer, matchKind: match.kind, matchLabel: match.label, interestLabel: match.interestLabel }] : [];
    }),
    discovery: pickDiscoveryOffers(offers, matchedIds, now),
  };
}

export async function reserveDigestBatch<T extends MatchableOffer>(input: {
  supabase: SupabaseClient;
  users: readonly { userId: string; digestEnabled: boolean }[];
  offers: readonly T[];
  kind: DigestKind;
  windowKey: string;
  now: Date;
}): Promise<Map<string, { personal: T[]; general: T[]; reservedKeys: string[]; skipped: number }>> {
  const result = new Map<string, { personal: T[]; general: T[]; reservedKeys: string[]; skipped: number }>();
  const enabledIds = input.users.filter((user) => user.digestEnabled).map((user) => user.userId);
  let interests: StoredInterest[] = [];
  if (enabledIds.length > 0) {
    try {
      const { data, error } = await input.supabase
        .from('user_product_interests')
        .select('id, user_id, label, label_norm, brand, brand_norm, model, model_norm, category, aliases, alias_norms, cadence, notify, updated_at')
        .in('user_id', enabledIds)
        .eq('notify', true)
        .limit(enabledIds.length * INTEREST_LIMITS.maxPerUser);
      if (!error) interests = ((data ?? []) as InterestRow[]).map(fromRow);
    } catch {
      interests = [];
    }
  }
  const byUser = new Map<string, StoredInterest[]>();
  for (const interest of interests) {
    const list = byUser.get(interest.userId) ?? [];
    list.push(interest);
    byUser.set(interest.userId, list);
  }

  const desired = new Map<string, { keys: string[]; offerIds: string[] }>();
  for (const user of input.users) {
    if (!user.digestEnabled) {
      desired.set(user.userId, { keys: [], offerIds: [] });
      continue;
    }
    const matches = selectDigestMatches({
      interests: byUser.get(user.userId) ?? [],
      offers: input.offers,
      now: input.now,
    });
    desired.set(user.userId, {
      keys: matches.map((match) =>
        deliveryKey({ kind: input.kind, userId: user.userId, offerId: match.offerId, windowKey: input.windowKey }),
      ),
      offerIds: matches.map((match) => match.offerId),
    });
  }

  const reserved = new Set<string>();
  if (enabledIds.length > 0) {
    try {
      await input.supabase
        .from('interest_mail_deliveries')
        .delete()
        .in('user_id', enabledIds)
        .eq('status', 'reserved')
        .lt('created_at', new Date(input.now.getTime() - 30 * 60 * 1000).toISOString());
      const { data } = await input.supabase
        .from('interest_mail_deliveries')
        .select('dedupe_key')
        .in('user_id', enabledIds)
        .eq('kind', input.kind)
        .eq('window_key', input.windowKey);
      for (const row of (data ?? []) as { dedupe_key: string }[]) reserved.add(row.dedupe_key);
    } catch {
      reserved.clear();
    }
  }

  const inserts: Record<string, string>[] = [];
  for (const user of input.users) {
    const plan = desired.get(user.userId) ?? { keys: [], offerIds: [] };
    const claim = claimDeliveryKeys(reserved, plan.keys);
    for (const key of claim.claimed) {
      inserts.push({
        dedupe_key: key,
        user_id: user.userId,
        offer_id: key.split(':')[2] ?? '',
        kind: input.kind,
        window_key: input.windowKey,
        status: 'reserved',
      });
    }
    const claimedIds = new Set(claim.claimed.map((key) => key.split(':')[2]));
    const personal = input.offers.filter((offer) => claimedIds.has(offer.id));
    const personalIds = new Set(personal.map((offer) => offer.id));
    result.set(user.userId, {
      personal,
      general: input.offers.filter((offer) => !personalIds.has(offer.id)),
      reservedKeys: claim.claimed,
      skipped: claim.skipped.length,
    });
  }
  if (inserts.length > 0) {
    const { error } = await input.supabase.from('interest_mail_deliveries').insert(inserts);
    if (error) {
      for (const user of input.users) {
        const current = result.get(user.userId);
        if (!current) continue;
        result.set(user.userId, { personal: [], general: [...input.offers], reservedKeys: [], skipped: current.skipped + current.reservedKeys.length });
      }
    }
  }
  return result;
}

export async function finishDigestDelivery(input: {
  supabase: SupabaseClient;
  reservedKeys: readonly string[];
  sent: boolean;
}): Promise<void> {
  const settled = settleDeliveries({ reserved: input.reservedKeys, sent: input.sent });
  if (settled.markSent.length > 0) {
    await input.supabase.from('interest_mail_deliveries').update({ status: 'sent' }).in('dedupe_key', settled.markSent);
  }
  if (settled.release.length > 0) {
    await input.supabase.from('interest_mail_deliveries').delete().in('dedupe_key', settled.release);
  }
}

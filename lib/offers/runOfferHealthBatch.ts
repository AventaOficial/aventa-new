import { createServerClient } from '@/lib/supabase/server';
import { daysAgoUtc } from '@/lib/owner/mxTime';
import { evaluateOfferHealth, type OfferHealthStatus } from '@/lib/offers/evaluateOfferHealth';
import {
  getOfferAutoApproveExpiryIso,
  OFFER_AUTO_APPROVE_TTL_MS,
} from '@/lib/server/offerAutoApprove';
import { captureAutomaticExpireOutcome } from '@/lib/autonomous';
import {
  compareFreshnessCandidates,
  freshnessPriorityScore,
  scheduleNextCheckAt,
  type FreshnessPersistedStatus,
} from '@/lib/offers/freshness/priority';
import {
  resolveFreshnessBatchLimit,
  resolveFreshnessDelayMs,
} from '@/lib/offers/freshness/policy';
import { incrementLaunchMetric } from '@/lib/observability/launchMetrics';

const OUT_OF_STOCK_AUTO_EXPIRE_STREAK = 2;
const EXTEND_MIN_OUTBOUND_7D = 1;

export type OfferHealthBatchResult = {
  scanned: number;
  updated: number;
  skipped: number;
  errors: number;
  extended: number;
  expired: number;
  byStatus: Record<OfferHealthStatus, number>;
  offerIds: string[];
  selector: 'due_queue' | 'legacy_hot';
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyByStatus(): Record<OfferHealthStatus, number> {
  return { available: 0, price_changed: 0, out_of_stock: 0, unknown: 0, error: 0 };
}

function isMissingHealthSchema(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('offer_health_state') ||
    m.includes('next_check_at') ||
    m.includes('consecutive_failures') ||
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('check constraint')
  );
}

function isPersistedStatus(value: string): value is FreshnessPersistedStatus {
  return (
    value === 'available' ||
    value === 'price_changed' ||
    value === 'out_of_stock' ||
    value === 'unknown' ||
    value === 'error'
  );
}

async function rankOffersByOutbound(offerIds: string[], sinceIso: string): Promise<Map<string, number>> {
  const supabase = createServerClient();
  const counts = new Map<string, number>();
  if (offerIds.length === 0) return counts;

  const { data, error } = await supabase
    .from('offer_events')
    .select('offer_id')
    .eq('event_type', 'outbound')
    .gte('created_at', sinceIso)
    .in('offer_id', offerIds);

  if (error) return counts;
  for (const row of data ?? []) {
    const id = (row as { offer_id: string }).offer_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

async function legacySelect(limit: number): Promise<string[]> {
  const supabase = createServerClient();
  const nowIso = new Date().toISOString();
  const since7d = daysAgoUtc(7);
  const selected = new Set<string>();

  const { data: priorityRows } = await supabase
    .from('offer_health_state')
    .select('offer_id')
    .eq('status', 'price_changed')
    .limit(8);

  for (const row of priorityRows ?? []) {
    if (selected.size >= limit) break;
    selected.add((row as { offer_id: string }).offer_id);
  }

  const { data: offers, error } = await supabase
    .from('offers')
    .select('id, offer_url')
    .in('status', ['approved', 'published'])
    .or(`expires_at.is.null,expires_at.gte.${nowIso}`)
    .not('offer_url', 'is', null)
    .limit(400);

  if (error || !offers?.length) return [...selected];

  const candidates = (offers as { id: string; offer_url: string | null }[]).filter(
    (o) => typeof o.offer_url === 'string' && o.offer_url.trim().length > 0
  );
  const outboundMap = await rankOffersByOutbound(
    candidates.map((o) => o.id),
    since7d
  );
  candidates.sort((a, b) => {
    const ob = (outboundMap.get(b.id) ?? 0) - (outboundMap.get(a.id) ?? 0);
    if (ob !== 0) return ob;
    return a.id.localeCompare(b.id);
  });
  for (const o of candidates) {
    if (selected.size >= limit) break;
    selected.add(o.id);
  }
  return [...selected];
}

type DueRow = {
  offer_id: string;
  status: string | null;
  last_checked_at: string | null;
  consecutive_failures: number | null;
};

export async function selectOfferIdsForHealthScan(limit: number): Promise<{
  ids: string[];
  selector: 'due_queue' | 'legacy_hot';
}> {
  const supabase = createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const pool = Math.min(limit * 4, 200);

  const { data, error } = await supabase
    .from('offer_health_state')
    .select('offer_id, status, last_checked_at, consecutive_failures, next_check_at')
    .or(`next_check_at.is.null,next_check_at.lte.${nowIso}`)
    .order('next_check_at', { ascending: true })
    .limit(pool);

  if (error || !data) {
    return { ids: await legacySelect(limit), selector: 'legacy_hot' };
  }

  const due = data as DueRow[];
  if (due.length === 0) return { ids: [], selector: 'due_queue' };

  const ids = due.map((row) => row.offer_id);
  const { data: offers, error: offerErr } = await supabase
    .from('offers')
    .select('id, created_at, offer_url, status, expires_at, deleted_at')
    .in('id', ids);

  if (offerErr || !offers) {
    return { ids: await legacySelect(limit), selector: 'legacy_hot' };
  }

  const offerById = new Map(
    (offers as {
      id: string;
      created_at: string | null;
      offer_url: string | null;
      status: string | null;
      expires_at: string | null;
      deleted_at: string | null;
    }[]).map((row) => [row.id, row])
  );

  const liveIds = ids.filter((id) => {
    const offer = offerById.get(id);
    if (!offer) return false;
    if (offer.deleted_at) return false;
    if (offer.status !== 'approved' && offer.status !== 'published') return false;
    if (!offer.offer_url?.trim()) return false;
    if (offer.expires_at && new Date(offer.expires_at).getTime() <= now.getTime()) return false;
    return true;
  });

  const outboundMap = await rankOffersByOutbound(liveIds, daysAgoUtc(7));
  const dueById = new Map(due.map((row) => [row.offer_id, row]));
  const ranked = liveIds
    .map((id) => {
      const health = dueById.get(id);
      const offer = offerById.get(id);
      return {
        id,
        score: freshnessPriorityScore({
          outbound7d: outboundMap.get(id) ?? 0,
          createdAt: offer?.created_at ?? null,
          healthStatus: health?.status ?? null,
          lastCheckedAt: health?.last_checked_at ?? null,
          now,
        }),
      };
    })
    .sort(compareFreshnessCandidates);

  return { ids: ranked.slice(0, limit).map((row) => row.id), selector: 'due_queue' };
}

async function rememberScan(result: OfferHealthBatchResult): Promise<void> {
  const supabase = createServerClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from('offer_freshness_scan_state').upsert(
    {
      id: 'default',
      last_finished_at: now,
      last_batch_limit: result.offerIds.length,
      last_scanned: result.scanned,
      last_errors: result.errors,
      updated_at: now,
    },
    { onConflict: 'id' }
  );
  if (error && !isMissingHealthSchema(error.message ?? '')) {
    console.error('[freshness] scan state persist failed', error.message);
  }
}

export async function runOfferHealthBatch(opts?: { limit?: number }): Promise<OfferHealthBatchResult> {
  const limit = opts?.limit ?? resolveFreshnessBatchLimit(process.env.OFFER_HEALTH_BATCH_LIMIT);
  const delayMs = resolveFreshnessDelayMs(process.env.OFFER_HEALTH_DELAY_MS);
  const selected = await selectOfferIdsForHealthScan(limit);
  const offerIds = selected.ids.slice(0, limit);
  const supabase = createServerClient();

  const result: OfferHealthBatchResult = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    extended: 0,
    expired: 0,
    byStatus: emptyByStatus(),
    offerIds,
    selector: selected.selector,
  };

  if (offerIds.length === 0) {
    await rememberScan(result);
    return result;
  }

  const since7d = daysAgoUtc(7);
  const outboundMap = await rankOffersByOutbound(offerIds, since7d);

  const { data: rows, error } = await supabase
    .from('offers')
    .select('id, price, offer_url, expires_at')
    .in('id', offerIds);

  if (error) {
    result.errors = offerIds.length;
    incrementLaunchMetric('freshness_failed', offerIds.length);
    incrementLaunchMetric('critical_errors');
    await rememberScan(result);
    return result;
  }

  const { data: prevHealth } = await supabase
    .from('offer_health_state')
    .select('offer_id, status, diagnostic, consecutive_failures')
    .in('offer_id', offerIds);
  const prevById = new Map(
    (prevHealth ?? []).map((row) => [
      (row as { offer_id: string }).offer_id,
      row as { status: string; diagnostic?: string | null; consecutive_failures?: number | null },
    ])
  );

  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      price: number;
      offer_url: string | null;
      expires_at: string | null;
    };
    result.scanned += 1;
    incrementLaunchMetric('freshness_checked');

    try {
      const evaluation = await evaluateOfferHealth({
        price: Number(row.price),
        offerUrl: row.offer_url ?? '',
      });

      const prev = prevById.get(row.id);
      const transient = evaluation.skipped;
      let persisted: FreshnessPersistedStatus = transient
        ? 'unknown'
        : isPersistedStatus(evaluation.status)
          ? evaluation.status
          : 'error';

      const failures = transient
        ? (prev?.consecutive_failures ?? 0) + 1
        : persisted === 'error'
          ? (prev?.consecutive_failures ?? 0) + 1
          : 0;

      const streak =
        persisted === 'out_of_stock' && prev?.status === 'out_of_stock'
          ? OUT_OF_STOCK_AUTO_EXPIRE_STREAK
          : persisted === 'out_of_stock'
            ? 1
            : 0;

      const nextCheck = scheduleNextCheckAt({
        now: new Date(),
        persistedStatus: persisted,
        outbound7d: outboundMap.get(row.id) ?? 0,
        consecutiveFailures: failures,
      });

      const basePayload = {
        offer_id: row.id,
        status: persisted,
        last_checked_at: new Date().toISOString(),
        published_price: evaluation.publishedPrice,
        live_price: evaluation.livePrice,
        price_delta_pct: evaluation.priceDeltaPct,
        diagnostic:
          streak >= OUT_OF_STOCK_AUTO_EXPIRE_STREAK
            ? `${evaluation.diagnostic ?? 'out_of_stock'}|auto_expire_streak=${streak}`
            : evaluation.diagnostic,
        updated_at: new Date().toISOString(),
      };

      const extendedPayload = {
        ...basePayload,
        next_check_at: nextCheck.toISOString(),
        consecutive_failures: failures,
        priority_score: freshnessPriorityScore({
          outbound7d: outboundMap.get(row.id) ?? 0,
          createdAt: null,
          healthStatus: persisted,
          lastCheckedAt: basePayload.last_checked_at,
          now: new Date(),
        }),
      };

      let upsertErr = (
        await supabase.from('offer_health_state').upsert(extendedPayload, { onConflict: 'offer_id' })
      ).error;

      if (upsertErr && isMissingHealthSchema(upsertErr.message ?? '')) {
        if (transient) {
          result.skipped += 1;
          incrementLaunchMetric('freshness_skipped');
          if (result.scanned < offerIds.length && delayMs > 0) await sleep(delayMs);
          continue;
        }
        persisted = evaluation.status === 'price_changed' || evaluation.status === 'out_of_stock'
          ? evaluation.status
          : 'available';
        upsertErr = (
          await supabase.from('offer_health_state').upsert(
            { ...basePayload, status: persisted },
            { onConflict: 'offer_id' }
          )
        ).error;
      }

      if (upsertErr) {
        result.errors += 1;
        incrementLaunchMetric('freshness_failed');
        if (isMissingHealthSchema(upsertErr.message ?? '')) break;
      } else {
        result.updated += 1;
        result.byStatus[persisted] += 1;
        if (transient) {
          result.skipped += 1;
          incrementLaunchMetric('freshness_skipped');
        }

        if (streak >= OUT_OF_STOCK_AUTO_EXPIRE_STREAK && persisted === 'out_of_stock') {
          const now = new Date().toISOString();
          const { error: expErr } = await supabase
            .from('offers')
            .update({ expires_at: now })
            .eq('id', row.id)
            .or(`expires_at.is.null,expires_at.gt.${now}`);
          if (!expErr) {
            result.expired += 1;
            incrementLaunchMetric('expired_offers_seen');
            void captureAutomaticExpireOutcome(row.id);
          }
        } else if (
          persisted === 'available' &&
          (outboundMap.get(row.id) ?? 0) >= EXTEND_MIN_OUTBOUND_7D
        ) {
          const currentExp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
          const floor = Date.now() + OFFER_AUTO_APPROVE_TTL_MS / 2;
          if (!row.expires_at || currentExp < floor) {
            const { error: extErr } = await supabase
              .from('offers')
              .update({ expires_at: getOfferAutoApproveExpiryIso() })
              .eq('id', row.id);
            if (!extErr) result.extended += 1;
          }
        }
      }
    } catch {
      result.errors += 1;
      incrementLaunchMetric('freshness_failed');
      incrementLaunchMetric('critical_errors');
    }

    if (result.scanned < offerIds.length && delayMs > 0) await sleep(delayMs);
  }

  await rememberScan(result);
  return result;
}

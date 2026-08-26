import { createServerClient } from '@/lib/supabase/server';
import { daysAgoUtc } from '@/lib/owner/mxTime';
import { evaluateOfferHealth, type OfferHealthStatus } from '@/lib/offers/evaluateOfferHealth';
import {
  getOfferAutoApproveExpiryIso,
  OFFER_AUTO_APPROVE_TTL_MS,
} from '@/lib/server/offerAutoApprove';

const BATCH_LIMIT = 25;
const DELAY_MS = 800;
/** Tras 2 lecturas consecutivas de agotado, la oferta se retira del feed. */
const OUT_OF_STOCK_AUTO_EXPIRE_STREAK = 2;
/** Si sigue disponible y tiene clics recientes, se extiende la vigencia. */
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
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingHealthTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('offer_health_state') || m.includes('does not exist');
}

async function rankOffersByOutbound(
  offerIds: string[],
  sinceIso: string
): Promise<Map<string, number>> {
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

export async function selectOfferIdsForHealthScan(limit = BATCH_LIMIT): Promise<string[]> {
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

  if (error || !offers?.length) {
    return [...selected];
  }

  const candidates = (offers as { id: string; offer_url: string | null }[]).filter(
    (o) => typeof o.offer_url === 'string' && o.offer_url.trim().length > 0
  );
  const ids = candidates.map((o) => o.id);
  const outboundMap = await rankOffersByOutbound(ids, since7d);

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

export async function runOfferHealthBatch(opts?: {
  limit?: number;
}): Promise<OfferHealthBatchResult> {
  const limit = opts?.limit ?? BATCH_LIMIT;
  const offerIds = (await selectOfferIdsForHealthScan(limit)).slice(0, limit);
  const supabase = createServerClient();

  const result: OfferHealthBatchResult = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    extended: 0,
    expired: 0,
    byStatus: { available: 0, price_changed: 0, out_of_stock: 0 },
    offerIds,
  };

  if (offerIds.length === 0) return result;

  const since7d = daysAgoUtc(7);
  const outboundMap = await rankOffersByOutbound(offerIds, since7d);

  const { data: rows, error } = await supabase
    .from('offers')
    .select('id, price, offer_url, expires_at')
    .in('id', offerIds);

  if (error) {
    result.errors = offerIds.length;
    return result;
  }

  // Historial previo de health para racha de agotado
  const { data: prevHealth } = await supabase
    .from('offer_health_state')
    .select('offer_id, status, diagnostic')
    .in('offer_id', offerIds);
  const prevById = new Map(
    (prevHealth ?? []).map((r) => [
      (r as { offer_id: string }).offer_id,
      r as { status: string; diagnostic?: string | null },
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

    try {
      const evaluation = await evaluateOfferHealth({
        price: Number(row.price),
        offerUrl: row.offer_url ?? '',
      });

      if (evaluation.skipped) {
        result.skipped += 1;
        if (result.scanned < offerIds.length) await sleep(DELAY_MS);
        continue;
      }

      const prev = prevById.get(row.id);
      const streak =
        evaluation.status === 'out_of_stock' && prev?.status === 'out_of_stock'
          ? OUT_OF_STOCK_AUTO_EXPIRE_STREAK
          : evaluation.status === 'out_of_stock'
            ? 1
            : 0;

      const payload = {
        offer_id: row.id,
        status: evaluation.status,
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

      const { error: upsertErr } = await supabase.from('offer_health_state').upsert(payload, {
        onConflict: 'offer_id',
      });

      if (upsertErr) {
        if (isMissingHealthTable(upsertErr.message ?? '')) {
          result.errors += 1;
          break;
        }
        result.errors += 1;
      } else {
        result.updated += 1;
        result.byStatus[evaluation.status] += 1;

        // Auto-expirar tras racha de agotado
        if (streak >= OUT_OF_STOCK_AUTO_EXPIRE_STREAK) {
          const now = new Date().toISOString();
          const { error: expErr } = await supabase
            .from('offers')
            .update({ expires_at: now })
            .eq('id', row.id)
            .or(`expires_at.is.null,expires_at.gt.${now}`);
          if (!expErr) result.expired += 1;
        } else if (
          evaluation.status === 'available' &&
          (outboundMap.get(row.id) ?? 0) >= EXTEND_MIN_OUTBOUND_7D
        ) {
          // Extender vigencia si sigue sana y tiene actividad
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
    }

    if (result.scanned < offerIds.length) await sleep(DELAY_MS);
  }

  return result;
}

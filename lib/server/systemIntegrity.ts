import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getValidCategoryValuesForFeed } from '@/lib/categories';
import { BANK_COUPON_OPTIONS } from '@/lib/bankCoupons';
import { getHomeFeed } from '@/lib/offers/feedService';
import { computeOfferScore } from '@/lib/offers/scoring';
import { ALLOWED_OFFER_VOTE_VALUES } from '@/lib/votes/reputationWeights';
import { MODERATION_LOCK_STALE_MS } from '@/lib/moderation/moderationLock';
import {
  classifyFreshnessCheck,
  classifyGenericCheck,
  classifyImageIntegrityCheck,
  classifyLifecycleRunCheck,
  classifyZeroCountCheck,
  finalizeIntegrityCheck,
  type FinalizedIntegrityCheck,
  type IntegrityCheckSpec,
  type IntegrityCheckState,
  type QueryErrorLike,
} from '@/lib/server/integrityClassification';

type RawIntegrityCheck = {
  name: string;
  ok: boolean;
  detail: string;
  state?: IntegrityCheckState;
};

export type SystemIntegrityCheck = FinalizedIntegrityCheck;

export type SystemIntegrityResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checks: SystemIntegrityCheck[];
  summary: {
    total: number;
    failed: number;
    passed: number;
    warned: number;
    notApplicable: number;
  };
};

const spec = (
  severity: IntegrityCheckSpec['severity'],
  onViolation: IntegrityCheckSpec['onViolation'],
  action: string,
  onSchemaMissing: IntegrityCheckSpec['onSchemaMissing'] = 'FAIL',
): IntegrityCheckSpec => ({ severity, onViolation, onSchemaMissing, action });

export const INTEGRITY_CHECK_SPECS: Record<string, IntegrityCheckSpec> = {
  'categories.mapping': spec('high', 'FAIL', 'Corregir el mapeo en lib/categories para las categorías listadas.'),
  'offers.category.integrity': spec('medium', 'WARN', 'Recategorizar las ofertas con categoría no canónica.'),
  'offers.bank_coupon.integrity': spec('low', 'WARN', 'Normalizar bank_coupon a valores de BANK_COUPON_OPTIONS.'),
  'offers.required_fields.integrity': spec('high', 'FAIL', 'Revisar ingesta: ofertas sin título/tienda o con precio negativo.'),
  'offers.price_logic.integrity': spec('medium', 'WARN', 'Revisar ofertas con price > original_price.'),
  'offer_votes.value.integrity': spec('high', 'FAIL', 'Investigar votos con valores fuera de ALLOWED_OFFER_VOTE_VALUES.'),
  'offer_votes.legacy_value_1': spec('low', 'WARN', 'Migrar votos legacy value=1 cuando exista política documentada.'),
  'offers.msi_range.integrity': spec('low', 'WARN', 'Corregir msi_months fuera de 1..24.'),
  'offers.image_url.integrity': spec('medium', 'WARN', 'Completar imagen en ofertas públicas o pendientes sin image_url.'),
  'view.ofertas_ranked_general': spec('critical', 'FAIL', 'Restaurar la vista ofertas_ranked_general: el feed depende de ella.'),
  'view.score_consistency': spec('medium', 'WARN', 'Revisar el cálculo de score en la vista frente a computeOfferScore.'),
  'feed.home.smoke': spec('critical', 'FAIL', 'El feed principal falla: revisar getHomeFeed y logs.'),
  'freshness.overdue': spec(
    'high',
    'WARN',
    'Aplicar launch_hardening_v2.sql (cola de frescura) o revisar el cron offer-health-scan.',
    'WARN',
  ),
  'lifecycle.last_run': spec('high', 'FAIL', 'Aplicar offers_lifecycle_v2.sql y habilitar el job offers-lifecycle-v2.'),
  'lifecycle.archive_invariant': spec('critical', 'FAIL', 'Ofertas archivadas visibles: revisar transiciones de lifecycle.'),
  'moderation.orphan_locks': spec('low', 'WARN', 'El lifecycle libera locks de ofertas no pending; verificar que corra.'),
  'moderation.stale_locks': spec('low', 'WARN', 'Locks pending vencidos tras la limpieza: revisar releaseStaleModerationLocks.'),
  'moderation.queue_depth': spec('medium', 'WARN', 'Cola de moderación > 1000: reforzar moderación o revisar ingesta.'),
  'supply.worker_recent': spec('medium', 'WARN', 'El worker de supply no corre hace >12h: revisar cron supply-engine.', 'NOT_APPLICABLE'),
  'runtime.exception': spec('critical', 'FAIL', 'El runner de integridad lanzó una excepción: revisar logs del cron.'),
};

const PRICE_LOGIC_SCAN_CAP = 5000;

function firstError(...results: { error: QueryErrorLike }[]): QueryErrorLike {
  return results.find((r) => r.error)?.error ?? null;
}

export function finalizeIntegrityResult(
  raw: RawIntegrityCheck[],
  startedAt: string,
  finishedAt: string,
): SystemIntegrityResult {
  const checks = raw.map((c) => finalizeIntegrityCheck(c, INTEGRITY_CHECK_SPECS[c.name], finishedAt));
  const count = (s: FinalizedIntegrityCheck['status']) => checks.filter((c) => c.status === s).length;
  const failed = count('FAIL');
  return {
    ok: failed === 0,
    startedAt,
    finishedAt,
    checks,
    summary: {
      total: checks.length,
      failed,
      passed: count('PASS'),
      warned: count('WARN'),
      notApplicable: count('NOT_APPLICABLE'),
    },
  };
}

export async function runSystemIntegrityChecks(): Promise<SystemIntegrityResult> {
  const checks: RawIntegrityCheck[] = [];
  const supabase = createServerClient();
  const startedAt = new Date().toISOString();

  const canonicalCategories = ALL_CATEGORIES.map((c) => c.value);
  const validBankCoupons = BANK_COUPON_OPTIONS.map((b) => b.value);

  try {
    const categoryMappingChecks = canonicalCategories.map((cat) => {
      const values = getValidCategoryValuesForFeed(cat);
      return { cat, ok: values.length > 0 };
    });
    const brokenMappings = categoryMappingChecks.filter((c) => !c.ok);
    checks.push({
      name: 'categories.mapping',
      ok: brokenMappings.length === 0,
      detail:
        brokenMappings.length === 0
          ? 'Todas las categorías tienen mapeo de query'
          : `Sin mapeo: ${brokenMappings.map((c) => c.cat).join(', ')}`,
    });

    const [totalOffersRes, validCategoryRes, nullCategoryRes, emptyCategoryRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }),
      supabase.from('offers').select('id', { count: 'exact', head: true }).in('category', canonicalCategories),
      supabase.from('offers').select('id', { count: 'exact', head: true }).is('category', null),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('category', ''),
    ]);

    const totalOffers = totalOffersRes.count ?? 0;
    const validCategory = validCategoryRes.count ?? 0;
    const nullCategory = nullCategoryRes.count ?? 0;
    const emptyCategory = emptyCategoryRes.count ?? 0;
    const invalidCategory = Math.max(0, totalOffers - validCategory - nullCategory - emptyCategory);
    checks.push(
      classifyGenericCheck({
        name: 'offers.category.integrity',
        error: firstError(totalOffersRes, validCategoryRes, nullCategoryRes, emptyCategoryRes),
        violated: invalidCategory > 0,
        detail: `total=${totalOffers}, valid=${validCategory}, null=${nullCategory}, empty=${emptyCategory}, invalid=${invalidCategory}`,
      })
    );

    const [bankNullRes, bankEmptyRes, bankValidRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).is('bank_coupon', null),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('bank_coupon', ''),
      supabase.from('offers').select('id', { count: 'exact', head: true }).in('bank_coupon', validBankCoupons),
    ]);
    const validBank = bankValidRes.count ?? 0;
    const nullBank = bankNullRes.count ?? 0;
    const emptyBank = bankEmptyRes.count ?? 0;
    const invalidBank = Math.max(0, totalOffers - validBank - nullBank - emptyBank);
    checks.push(
      classifyGenericCheck({
        name: 'offers.bank_coupon.integrity',
        error: firstError(totalOffersRes, bankNullRes, bankEmptyRes, bankValidRes),
        violated: invalidBank > 0,
        detail: `total=${totalOffers}, valid=${validBank}, null=${nullBank}, empty=${emptyBank}, invalid=${invalidBank}`,
      })
    );

    const [missingTitleRes, missingStoreRes, negativePriceRes, negativeOriginalPriceRes, pricedRowsRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('title.is.null,title.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('store.is.null,store.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).lt('price', 0),
      supabase.from('offers').select('id', { count: 'exact', head: true }).lt('original_price', 0),
      // PostgREST no compara columnas entre sí: lectura acotada y comparación en memoria.
      supabase
        .from('offers')
        .select('price, original_price')
        .not('original_price', 'is', null)
        .is('deleted_at', null)
        .limit(PRICE_LOGIC_SCAN_CAP),
    ]);
    const missingTitle = missingTitleRes.count ?? 0;
    const missingStore = missingStoreRes.count ?? 0;
    const negativePrice = negativePriceRes.count ?? 0;
    const negativeOriginalPrice = negativeOriginalPriceRes.count ?? 0;
    const pricedRows = (pricedRowsRes.data ?? []) as { price: number | null; original_price: number | null }[];
    const priceGreaterThanOriginal = pricedRows.filter(
      (r) => r.price != null && r.original_price != null && Number(r.price) > Number(r.original_price),
    ).length;
    checks.push(
      classifyGenericCheck({
        name: 'offers.required_fields.integrity',
        error: firstError(missingTitleRes, missingStoreRes, negativePriceRes, negativeOriginalPriceRes),
        violated: missingTitle + missingStore + negativePrice + negativeOriginalPrice > 0,
        detail: `missing_title=${missingTitle}, missing_store=${missingStore}, negative_price=${negativePrice}, negative_original_price=${negativeOriginalPrice}`,
      })
    );

    checks.push(
      classifyGenericCheck({
        name: 'offers.price_logic.integrity',
        error: pricedRowsRes.error,
        violated: priceGreaterThanOriginal > 0,
        detail: `price_gt_original=${priceGreaterThanOriginal} (scanned=${pricedRows.length}${pricedRows.length >= PRICE_LOGIC_SCAN_CAP ? ', capped' : ''})`,
      })
    );

    const [totalVotesRes, validVotesRes, legacyVotesRes, nullVotesRes] = await Promise.all([
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }),
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }).in('value', [...ALLOWED_OFFER_VOTE_VALUES]),
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }).eq('value', 1),
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }).is('value', null),
    ]);
    const totalVotes = totalVotesRes.count ?? 0;
    const validVotes = validVotesRes.count ?? 0;
    const legacyVotes = legacyVotesRes.count ?? 0;
    const nullVotes = nullVotesRes.count ?? 0;
    const invalidVotes = Math.max(0, totalVotes - validVotes - nullVotes);
    checks.push(
      classifyGenericCheck({
        name: 'offer_votes.value.integrity',
        error: firstError(totalVotesRes, validVotesRes, nullVotesRes),
        violated: invalidVotes > 0,
        detail: `total=${totalVotes}, valid=${validVotes}, null=${nullVotes}, invalid=${invalidVotes}`,
      })
    );
    checks.push(
      classifyGenericCheck({
        name: 'offer_votes.legacy_value_1',
        error: legacyVotesRes.error,
        violated: legacyVotes > 0,
        detail: `legacy_value_1=${legacyVotes}`,
      })
    );

    const nowIso = new Date().toISOString();
    const missingImageFilter = 'image_url.is.null,image_url.eq.';
    const [msiInvalidRes, missingImageAllRes, missingImageActiveRes, missingImagePendingRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('msi_months.lt.1,msi_months.gt.24'),
      supabase.from('offers').select('id', { count: 'exact' }).or(missingImageFilter).limit(1),
      supabase
        .from('offers')
        .select('id', { count: 'exact' })
        .or(`and(or(${missingImageFilter}),or(expires_at.is.null,expires_at.gt.${nowIso}))`)
        .in('status', ['approved', 'published'])
        .is('deleted_at', null)
        .limit(1),
      supabase
        .from('offers')
        .select('id', { count: 'exact' })
        .or(missingImageFilter)
        .eq('status', 'pending')
        .is('deleted_at', null)
        .limit(1),
    ]);
    const msiInvalid = msiInvalidRes.count ?? 0;
    checks.push(
      classifyGenericCheck({
        name: 'offers.msi_range.integrity',
        error: msiInvalidRes.error,
        violated: msiInvalid > 0,
        detail: `invalid_msi_months=${msiInvalid}`,
      })
    );
    const activeMissing = missingImageActiveRes.count ?? 0;
    const pendingMissing = missingImagePendingRes.count ?? 0;
    checks.push(
      classifyImageIntegrityCheck({
        error: missingImageAllRes.error ?? missingImageActiveRes.error ?? missingImagePendingRes.error,
        activeMissing,
        pendingMissing,
        nonOperationalMissing: Math.max(0, (missingImageAllRes.count ?? 0) - activeMissing - pendingMissing),
      })
    );

    const { data: viewRow, error: viewError } = await supabase
      .from('ofertas_ranked_general')
      .select('id, category, bank_coupon, tags, ranking_blend, up_votes, down_votes, score')
      .limit(1)
      .maybeSingle();
    checks.push(
      classifyGenericCheck({
        name: 'view.ofertas_ranked_general',
        error: viewError,
        violated: false,
        detail: `OK (sample id=${viewRow?.id ?? 'n/a'})`,
      })
    );

    if (!viewError && viewRow) {
      const sample = viewRow as { up_votes?: number | null; down_votes?: number | null; score?: number | null };
      const expected = computeOfferScore(sample.up_votes ?? 0, sample.down_votes ?? 0);
      const actual = Number(sample.score ?? 0);
      checks.push({
        name: 'view.score_consistency',
        ok: actual === expected,
        detail: `expected=${expected}, actual=${actual}`,
      });
    }

    const feedRes = await getHomeFeed({ limit: 5, type: 'trending' });
    checks.push({
      name: 'feed.home.smoke',
      ok: feedRes.success,
      detail: feedRes.success ? `items=${feedRes.data.length}` : feedRes.error,
    });

    const overdueBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { error: freshnessProbeError } = await supabase
      .from('offer_health_state')
      .select('offer_id, next_check_at')
      .limit(1);
    let freshnessOverdue: number | null = null;
    let freshnessCountError: QueryErrorLike = null;
    if (!freshnessProbeError) {
      const res = await supabase
        .from('offer_health_state')
        .select('offer_id', { count: 'exact' })
        .lte('next_check_at', overdueBefore)
        .limit(1);
      freshnessOverdue = res.count;
      freshnessCountError = res.error;
    }
    checks.push(
      classifyFreshnessCheck({
        probeError: freshnessProbeError,
        countError: freshnessCountError,
        overdue: freshnessOverdue,
      })
    );

    const { data: lifecycleRun, error: lifecycleError } = await supabase
      .from('offer_lifecycle_runs')
      .select('started_at, backlog_remaining')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lifecycleRow = lifecycleRun as { started_at?: string; backlog_remaining?: boolean } | null;
    checks.push(
      classifyLifecycleRunCheck({
        error: lifecycleError,
        lastStartedAt: lifecycleRow?.started_at ?? null,
        backlogRemaining: lifecycleRow?.backlog_remaining ?? null,
        nowMs: Date.now(),
      })
    );

    const staleLockBefore = new Date(Date.now() - MODERATION_LOCK_STALE_MS).toISOString();
    const [orphanLocksRes, archivedVisibleRes, staleLocksRes] = await Promise.all([
      supabase
        .from('offers')
        .select('id', { count: 'exact' })
        .neq('status', 'pending')
        .not('locked_by', 'is', null)
        .limit(1),
      supabase
        .from('offers')
        .select('id', { count: 'exact' })
        .not('archived_at', 'is', null)
        .in('status', ['approved', 'published'])
        .is('deleted_at', null)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(1),
      supabase
        .from('offers')
        .select('id', { count: 'exact' })
        .eq('status', 'pending')
        .not('locked_by', 'is', null)
        .lt('locked_at', staleLockBefore)
        .limit(1),
    ]);
    checks.push(
      classifyZeroCountCheck({
        name: 'moderation.stale_locks',
        error: staleLocksRes.error,
        count: staleLocksRes.count,
        label: 'pending_locked_past_ttl',
        migration: 'n/a',
      })
    );
    checks.push(
      classifyZeroCountCheck({
        name: 'moderation.orphan_locks',
        error: orphanLocksRes.error,
        count: orphanLocksRes.count,
        label: 'locked_non_pending',
        migration: 'n/a',
      })
    );
    checks.push(
      classifyZeroCountCheck({
        name: 'lifecycle.archive_invariant',
        error: archivedVisibleRes.error,
        count: archivedVisibleRes.count,
        label: 'archived_but_public',
        migration: 'offers_lifecycle_v2.sql',
      })
    );

    const { count: pendingCount, error: pendingError } = await supabase
      .from('offers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    checks.push(
      classifyGenericCheck({
        name: 'moderation.queue_depth',
        error: pendingError,
        violated: (pendingCount ?? 0) >= 1000,
        detail: `pending=${pendingCount ?? 0}`,
        violationState: 'overdue',
      })
    );

    const { data: supplyRun, error: supplyError } = await supabase
      .from('hunter_supply_runs')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const supplyStartedAt = (supplyRun as { started_at?: string } | null)?.started_at;
    const supplyStale =
      supplyStartedAt == null || Date.now() - new Date(supplyStartedAt).getTime() > 12 * 60 * 60 * 1000;
    checks.push(
      classifyGenericCheck({
        name: 'supply.worker_recent',
        error: supplyError,
        violated: supplyStale,
        detail: supplyStartedAt ? `last_started_at=${supplyStartedAt}` : 'no runs recorded',
        violationState: 'stale',
      })
    );

    checks.push({
      name: 'runtime.exception',
      ok: true,
      detail: 'Sin excepciones durante ejecución',
    });
  } catch (error) {
    checks.push({
      name: 'runtime.exception',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return finalizeIntegrityResult(checks, startedAt, new Date().toISOString());
}

export async function persistSystemIntegrityResult(result: SystemIntegrityResult): Promise<void> {
  const supabase = createServerClient();
  const payload = {
    key: 'system_integrity_last',
    value: result,
  };
  const { error } = await supabase.from('app_config').upsert(payload, { onConflict: 'key' });
  if (error) {
    console.error('[SYSTEM INTEGRITY] persist failed', error.message);
  }
}


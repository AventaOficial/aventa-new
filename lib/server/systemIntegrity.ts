import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getValidCategoryValuesForFeed } from '@/lib/categories';
import { BANK_COUPON_OPTIONS } from '@/lib/bankCoupons';
import { getHomeFeed } from '@/lib/offers/feedService';
import { computeOfferScore } from '@/lib/offers/scoring';
import { ALLOWED_OFFER_VOTE_VALUES } from '@/lib/votes/reputationWeights';
import {
  classifyFreshnessCheck,
  classifyImageIntegrityCheck,
  classifyLifecycleRunCheck,
  classifyZeroCountCheck,
  type IntegrityCheckState,
  type QueryErrorLike,
} from '@/lib/server/integrityClassification';

export type SystemIntegrityCheck = {
  name: string;
  ok: boolean;
  detail: string;
  state?: IntegrityCheckState;
};

export type SystemIntegrityResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checks: SystemIntegrityCheck[];
  summary: {
    total: number;
    failed: number;
    passed: number;
  };
};

export async function runSystemIntegrityChecks(): Promise<SystemIntegrityResult> {
  const checks: SystemIntegrityCheck[] = [];
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
    checks.push({
      name: 'offers.category.integrity',
      ok: invalidCategory === 0,
      detail: `total=${totalOffers}, valid=${validCategory}, null=${nullCategory}, empty=${emptyCategory}, invalid=${invalidCategory}`,
    });

    const [bankNullRes, bankEmptyRes, bankValidRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).is('bank_coupon', null),
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('bank_coupon', ''),
      supabase.from('offers').select('id', { count: 'exact', head: true }).in('bank_coupon', validBankCoupons),
    ]);
    const validBank = bankValidRes.count ?? 0;
    const nullBank = bankNullRes.count ?? 0;
    const emptyBank = bankEmptyRes.count ?? 0;
    const invalidBank = Math.max(0, totalOffers - validBank - nullBank - emptyBank);
    checks.push({
      name: 'offers.bank_coupon.integrity',
      ok: invalidBank === 0,
      detail: `total=${totalOffers}, valid=${validBank}, null=${nullBank}, empty=${emptyBank}, invalid=${invalidBank}`,
    });

    const [missingTitleRes, missingStoreRes, negativePriceRes, negativeOriginalPriceRes, priceGreaterThanOriginalRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('title.is.null,title.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('store.is.null,store.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).lt('price', 0),
      supabase.from('offers').select('id', { count: 'exact', head: true }).lt('original_price', 0),
      supabase.from('offers').select('id', { count: 'exact', head: true }).not('original_price', 'is', null).filter('price', 'gt', 'original_price'),
    ]);
    const missingTitle = missingTitleRes.count ?? 0;
    const missingStore = missingStoreRes.count ?? 0;
    const negativePrice = negativePriceRes.count ?? 0;
    const negativeOriginalPrice = negativeOriginalPriceRes.count ?? 0;
    const priceGreaterThanOriginal = priceGreaterThanOriginalRes.count ?? 0;
    checks.push({
      name: 'offers.required_fields.integrity',
      ok: missingTitle === 0 && missingStore === 0 && negativePrice === 0 && negativeOriginalPrice === 0,
      detail: `missing_title=${missingTitle}, missing_store=${missingStore}, negative_price=${negativePrice}, negative_original_price=${negativeOriginalPrice}`,
    });

    checks.push({
      name: 'offers.price_logic.integrity',
      ok: priceGreaterThanOriginal === 0,
      detail: `price_gt_original=${priceGreaterThanOriginal}`,
    });

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
    checks.push({
      name: 'offer_votes.value.integrity',
      ok: invalidVotes === 0,
      detail: `total=${totalVotes}, valid=${validVotes}, null=${nullVotes}, invalid=${invalidVotes}`,
    });
    checks.push({
      name: 'offer_votes.legacy_value_1',
      ok: legacyVotes === 0,
      detail: `legacy_value_1=${legacyVotes}`,
    });

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
    checks.push({
      name: 'offers.msi_range.integrity',
      ok: msiInvalid === 0,
      detail: `invalid_msi_months=${msiInvalid}`,
    });
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
    checks.push({
      name: 'view.ofertas_ranked_general',
      ok: !viewError,
      detail: viewError ? viewError.message : `OK (sample id=${viewRow?.id ?? 'n/a'})`,
    });

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

    const [orphanLocksRes, archivedVisibleRes] = await Promise.all([
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
    ]);
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
    checks.push({
      name: 'moderation.queue_depth',
      ok: !pendingError && (pendingCount ?? 0) < 1000,
      detail: pendingError ? pendingError.message : `pending=${pendingCount ?? 0}`,
    });

    const { data: supplyRun, error: supplyError } = await supabase
      .from('hunter_supply_runs')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const supplyMissing = supplyError?.message?.toLowerCase().includes('does not exist') === true;
    const startedAt = (supplyRun as { started_at?: string } | null)?.started_at;
    const supplyStale =
      startedAt != null && Date.now() - new Date(startedAt).getTime() > 12 * 60 * 60 * 1000;
    checks.push({
      name: 'supply.worker_recent',
      ok: supplyMissing || (!supplyError && !supplyStale),
      detail: supplyMissing
        ? 'hunter_supply_runs missing'
        : supplyError
          ? supplyError.message
          : startedAt
            ? `last_started_at=${startedAt}`
            : 'no runs yet',
    });

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

  const failed = checks.filter((c) => !c.ok);
  return {
    ok: failed.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      failed: failed.length,
      passed: checks.length - failed.length,
    },
  };
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


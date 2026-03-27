import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getValidCategoryValuesForFeed } from '@/lib/categories';
import { BANK_COUPON_OPTIONS } from '@/lib/bankCoupons';
import { getHomeFeed } from '@/lib/offers/feedService';
import { computeOfferScore } from '@/lib/offers/scoring';

export type SystemIntegrityCheck = {
  name: string;
  ok: boolean;
  detail: string;
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

    const [missingTitleRes, missingStoreRes, negativePriceRes] = await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('title.is.null,title.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).or('store.is.null,store.eq.'),
      supabase.from('offers').select('id', { count: 'exact', head: true }).lt('price', 0),
    ]);
    const missingTitle = missingTitleRes.count ?? 0;
    const missingStore = missingStoreRes.count ?? 0;
    const negativePrice = negativePriceRes.count ?? 0;
    checks.push({
      name: 'offers.required_fields.integrity',
      ok: missingTitle === 0 && missingStore === 0 && negativePrice === 0,
      detail: `missing_title=${missingTitle}, missing_store=${missingStore}, negative_price=${negativePrice}`,
    });

    const [totalVotesRes, validVotesRes, nullVotesRes] = await Promise.all([
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }),
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }).in('value', [-1, 2]),
      supabase.from('offer_votes').select('id', { count: 'exact', head: true }).is('value', null),
    ]);
    const totalVotes = totalVotesRes.count ?? 0;
    const validVotes = validVotesRes.count ?? 0;
    const nullVotes = nullVotesRes.count ?? 0;
    const invalidVotes = Math.max(0, totalVotes - validVotes - nullVotes);
    checks.push({
      name: 'offer_votes.value.integrity',
      ok: invalidVotes === 0,
      detail: `total=${totalVotes}, valid=${validVotes}, null=${nullVotes}, invalid=${invalidVotes}`,
    });

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


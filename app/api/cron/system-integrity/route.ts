import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { createServerClient } from '@/lib/supabase/server';
import { ALL_CATEGORIES, getValidCategoryValuesForFeed } from '@/lib/categories';
import { BANK_COUPON_OPTIONS } from '@/lib/bankCoupons';
import { getHomeFeed } from '@/lib/offers/feedService';

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const checks: CheckResult[] = [];
  const supabase = createServerClient();
  const startedAt = new Date().toISOString();

  const canonicalCategories = ALL_CATEGORIES.map((c) => c.value);
  const validBankCoupons = BANK_COUPON_OPTIONS.map((b) => b.value);

  try {
    // 1) Chequeo de contrato del catálogo de categorías
    const categoryMappingChecks = canonicalCategories.map((cat) => {
      const values = getValidCategoryValuesForFeed(cat);
      return { cat, ok: values.length > 0, values };
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

    // 2) Integridad de categorías en offers (conteos de control)
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

    // 3) Integridad de bank_coupon en offers
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

    // 4) Vista feed y columnas clave
    const { data: viewRow, error: viewError } = await supabase
      .from('ofertas_ranked_general')
      .select('id, category, bank_coupon, tags, ranking_blend')
      .limit(1)
      .maybeSingle();
    if (viewError) {
      checks.push({
        name: 'view.ofertas_ranked_general',
        ok: false,
        detail: viewError.message,
      });
    } else {
      checks.push({
        name: 'view.ofertas_ranked_general',
        ok: true,
        detail: `OK (sample id=${viewRow?.id ?? 'n/a'})`,
      });
    }

    // 5) Smoke test de feed principal
    const feedRes = await getHomeFeed({ limit: 5, type: 'trending' });
    checks.push({
      name: 'feed.home.smoke',
      ok: feedRes.success,
      detail: feedRes.success ? `items=${feedRes.data.length}` : feedRes.error,
    });
  } catch (error) {
    checks.push({
      name: 'runtime.exception',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const failed = checks.filter((c) => !c.ok);
  const payload = {
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

  if (failed.length > 0) {
    console.error('[SYSTEM INTEGRITY] failed checks', failed);
    return NextResponse.json(payload, { status: 500 });
  }
  return NextResponse.json(payload, { status: 200 });
}

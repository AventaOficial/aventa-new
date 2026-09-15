/**
 * Analiza supply histórico real desde offers (moderación) — sin discovery nueva.
 * Mide approve/reject rates por categoría/source cuando existan señales.
 */
import { createClient } from '@supabase/supabase-js';

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: offers, error } = await sb
    .from('offers')
    .select(
      'id,status,title,store,category,discount_percent,discount_price,original_price,created_at,moderator_comment,bot_meta,created_by',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const rows = offers ?? [];
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, { total: number; approved: number; rejected: number; pending: number }> = {};
  const byStore: Record<string, { total: number; approved: number; rejected: number }> = {};
  let botish = 0;

  for (const o of rows) {
    const st = (o.status ?? 'unknown') as string;
    byStatus[st] = (byStatus[st] ?? 0) + 1;
    const cat = (o.category ?? 'unknown') as string;
    const store = (o.store ?? 'unknown') as string;
    byCategory[cat] ??= { total: 0, approved: 0, rejected: 0, pending: 0 };
    byStore[store] ??= { total: 0, approved: 0, rejected: 0 };
    byCategory[cat].total += 1;
    byStore[store].total += 1;
    if (st === 'approved' || st === 'active' || st === 'published') {
      byCategory[cat].approved += 1;
      byStore[store].approved += 1;
    } else if (st === 'rejected') {
      byCategory[cat].rejected += 1;
      byStore[store].rejected += 1;
    } else if (st === 'pending') {
      byCategory[cat].pending += 1;
    }
    const mc = String(o.moderator_comment ?? '').toLowerCase();
    if (mc.includes('[bot-ingest]') || o.bot_meta != null) botish += 1;
  }

  const topCats = Object.entries(byCategory)
    .map(([k, v]) => ({
      category: k,
      ...v,
      approvalRate: v.total ? Math.round((v.approved / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  const topStores = Object.entries(byStore)
    .map(([k, v]) => ({
      store: k,
      ...v,
      approvalRate: v.total ? Math.round((v.approved / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  console.log(
    JSON.stringify(
      {
        windowDays: 14,
        sampleSize: rows.length,
        botishApprox: botish,
        byStatus,
        topCats,
        topStores,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

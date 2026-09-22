import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requirePayoutOps } from '@/lib/staff/requireFinanceStaff';
import { fiscalProfileFromRow } from '@/lib/commissions/fiscal';
import {
  buildBatchExportCsv,
  buildPaidExportCsv,
  composePayoutOpsSnapshot,
  loadPayoutOpsData,
  resolvePayoutOpsRuntime,
  type PaidExportRow,
} from '@/lib/finance/payoutOps';

export const dynamic = 'force-dynamic';

function periodRange(periodKey: string): { start: Date; end: Date } | null {
  const m = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  if (mo < 0 || mo > 11) return null;
  return { start: new Date(Date.UTC(y, mo, 1)), end: new Date(Date.UTC(y, mo + 1, 1)) };
}

/**
 * Export contable (V6). ?kind=batch (preview actual) | paid&period=YYYY-MM (pagos confirmados).
 * Solo lectura. CLABE enmascarada.
 */
export async function GET(request: Request) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') ?? 'batch';
  const now = new Date();
  const defaultPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const periodKey = url.searchParams.get('period') ?? defaultPeriod;
  const range = periodRange(periodKey);
  if (!range) return NextResponse.json({ error: 'period inválido (YYYY-MM)' }, { status: 400 });

  const supabase = createServerClient();
  const filename = `aventa-pagos-${kind}-${periodKey}.csv`;
  const headers = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  };

  try {
    if (kind === 'batch') {
      const data = await loadPayoutOpsData(supabase);
      const snapshot = composePayoutOpsSnapshot(data, resolvePayoutOpsRuntime(), auth.role);
      return new NextResponse(buildBatchExportCsv(snapshot.batch, data.profiles), { headers });
    }
    if (kind !== 'paid') return NextResponse.json({ error: 'kind inválido (batch | paid)' }, { status: 400 });

    const rows: PaidExportRow[] = [];
    const startIso = range.start.toISOString();
    const endIso = range.end.toISOString();

    const { data: intents } = await supabase
      .from('payout_intents')
      .select('id, creator_id, amount_cents, currency, status, provider, idempotency_key, meta, resolved_at')
      .eq('status', 'SUCCEEDED')
      .gte('resolved_at', startIso)
      .lt('resolved_at', endIso)
      .limit(5000);
    for (const r of intents ?? []) {
      const row = r as Record<string, unknown>;
      const meta = (row.meta && typeof row.meta === 'object' ? row.meta : {}) as Record<string, unknown>;
      const providerRef =
        (typeof meta.provider_reference === 'string' && meta.provider_reference) ||
        (typeof meta.external_ref === 'string' && meta.external_ref) ||
        null;
      rows.push({
        paidAt: String(row.resolved_at ?? ''),
        creatorId: String(row.creator_id ?? ''),
        legalName: null,
        rfc: null,
        clabe: null,
        amountCents: Number(row.amount_cents) || 0,
        currency: String(row.currency ?? 'MXN'),
        reference: providerRef ?? String(row.idempotency_key ?? row.id),
        source: 'payout_intent',
        provider: (row.provider as string | null) ?? null,
      });
    }

    const { data: payouts } = await supabase
      .from('reward_payouts')
      .select('id, user_id, amount_cents, status, paid_at, spei_reference')
      .eq('status', 'completed')
      .gte('paid_at', startIso)
      .lt('paid_at', endIso)
      .limit(5000);
    for (const r of payouts ?? []) {
      const row = r as Record<string, unknown>;
      rows.push({
        paidAt: String(row.paid_at ?? ''),
        creatorId: String(row.user_id ?? ''),
        legalName: null,
        rfc: null,
        clabe: null,
        amountCents: Number(row.amount_cents) || 0,
        currency: 'MXN',
        reference: (row.spei_reference as string | null) ?? String(row.id),
        source: 'reward_payout',
        provider: null,
      });
    }

    const creatorIds = [...new Set(rows.map((r) => r.creatorId).filter(Boolean))].slice(0, 1000);
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at')
        .in('id', creatorIds);
      const byId = new Map<string, { legalName: string | null; rfc: string | null; clabe: string | null }>();
      for (const p of profiles ?? []) {
        const f = fiscalProfileFromRow(p);
        byId.set(String(p.id), { legalName: f.legalName, rfc: f.rfc, clabe: f.clabe });
      }
      for (const r of rows) {
        const f = byId.get(r.creatorId);
        if (f) {
          r.legalName = f.legalName;
          r.rfc = f.rfc;
          r.clabe = f.clabe;
        }
      }
    }

    return new NextResponse(buildPaidExportCsv(rows, periodKey), { headers });
  } catch (e) {
    console.error('[payout-ops/export]', e);
    return NextResponse.json({ error: 'No se pudo generar el export' }, { status: 500 });
  }
}

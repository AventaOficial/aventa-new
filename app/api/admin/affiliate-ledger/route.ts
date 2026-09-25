import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { affiliateLedgerInsertSchema } from '@/lib/commissions/affiliateLedger';
import { fingerprintLedgerRow } from '@/lib/commissions/ledgerFingerprint';
import { appendEconomicEvent } from '@/lib/economy/appendEconomicEvent';
import {
  NETWORK_EVIDENCE_REWARDS_DISABLED,
  assertNetworkEvidenceExternalRefAllowed,
} from '@/lib/economy/ledger/canonicalLedgerAuthority';
import { isMoneyPathFrozen, moneyPathFrozenHttpBody } from '@/lib/server/moneyPathFreeze';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function hasMissingTable(error: { message?: string } | null): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes('affiliate_ledger') || m.includes('does not exist') || m.includes('schema cache');
}

/** GET: listado de movimientos del libro de afiliados (solo owner/admin). */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const network = url.searchParams.get('network')?.trim();

  const supabase = createServerClient();
  let q = supabase
    .from('affiliate_ledger_entries')
    .select(
      'id, network, amount_cents, currency, period_start, period_end, status, external_ref, notes, source, meta, creator_id, tracking_tag, offer_id, attributable, created_at, updated_at',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (network) {
    q = q.eq('network', network);
  }

  const { data, error, count } = await q;
  if (error) {
    if (hasMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            'Tabla no creada. Ejecuta en Supabase: docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 }
      );
    }
    if (
      (error.message ?? '').includes('creator_id') ||
      (error.message ?? '').includes('attributable') ||
      error.code === 'PGRST204'
    ) {
      const fallback = await supabase
        .from('affiliate_ledger_entries')
        .select(
          'id, network, amount_cents, currency, period_start, period_end, status, external_ref, notes, source, meta, created_at, updated_at',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (fallback.error) {
        return NextResponse.json(
          {
            error:
              'Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql para columnas de atribución',
          },
          { status: 503 },
        );
      }
      return NextResponse.json({
        entries: fallback.data ?? [],
        total: fallback.count ?? null,
        limit,
        offset,
      });
    }
    console.error('[affiliate-ledger GET]', error.message);
    return NextResponse.json({ error: 'Error al listar' }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? null, limit, offset });
}

/** POST: alta manual de evidencia de red (reporte) al ledger canónico — sin mint de rewards. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }
  void NETWORK_EVIDENCE_REWARDS_DISABLED;

  const raw = await request.json().catch(() => ({}));
  const parsed = affiliateLedgerInsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Datos inválidos', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 }
    );
  }

  const row = parsed.data;
  const rawBody = raw as { dedupe_strategy?: string };
  const dedupeStrategy =
    rawBody.dedupe_strategy === 'fingerprint' ? 'fingerprint' : 'require_external_ref';
  let externalRef = row.external_ref?.trim() || null;
  if (!externalRef && dedupeStrategy !== 'fingerprint') {
    return NextResponse.json(
      {
        error:
          'external_ref es obligatorio. Si el reporte no trae ID, envía dedupe_strategy=fingerprint.',
      },
      { status: 400 },
    );
  }
  if (!externalRef) {
    externalRef = fingerprintLedgerRow({
      network: row.network,
      amount_cents: row.amount_cents,
      currency: row.currency,
      tracking_tag: row.tracking_tag,
      period_start: row.period_start,
      period_end: row.period_end,
      notes: row.notes,
    });
  }

  const reserved = assertNetworkEvidenceExternalRefAllowed(externalRef);
  if (!reserved.ok) {
    return NextResponse.json({ error: reserved.error }, { status: 400 });
  }

  const supabase = createServerClient();
  const payload = {
    network: row.network,
    amount_cents: row.amount_cents,
    currency: row.currency,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    status: row.status,
    external_ref: externalRef,
    notes: row.notes ?? null,
    source: row.source,
    meta: {
      ...(row.meta ?? {}),
      evidence_ingest: true,
      imported_by: auth.user.id,
    },
    creator_id: row.creator_id ?? null,
    tracking_tag: row.tracking_tag ?? null,
    offer_id: row.offer_id ?? null,
    attributable: row.attributable,
  };

  const { data, error } = await supabase
    .from('affiliate_ledger_entries')
    .insert(payload)
    .select(
      'id, network, amount_cents, status, external_ref, notes, meta, created_at, tracking_tag, offer_id, creator_id, click_id',
    )
    .single();
  if (error) {
    if (hasMissingTable(error)) {
      return NextResponse.json(
        {
          error:
            'Tabla no creada. Ejecuta en Supabase: docs/supabase-migrations/affiliate_platform_ledger.sql',
        },
        { status: 503 }
      );
    }
    if (error.code === '23505' || (error.message ?? '').includes('affiliate_ledger_unique_external')) {
      return NextResponse.json({ error: 'Ya existe un movimiento con esa red y referencia externa.' }, { status: 409 });
    }
    if (
      (error.message ?? '').includes('creator_id') ||
      (error.message ?? '').includes('attributable') ||
      error.code === 'PGRST204'
    ) {
      return NextResponse.json(
        {
          error:
            'Falta migración de atribución. Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql',
        },
        { status: 503 },
      );
    }
    console.error('[affiliate-ledger POST]', error.message);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }

  if (data?.id) {
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: String(data.id),
      eventType: 'network_report_evidence_ingested',
      toStatus: row.status,
      actor: `admin:${auth.user.id}`,
      payload: {
        source: 'manual_post',
        rewardsCreated: false,
        note: 'evidence_ingest_not_settlement_bridge',
      },
    });
    if (!audit.ok) {
      await supabase.from('affiliate_ledger_entries').delete().eq('id', data.id);
      return NextResponse.json(
        { error: 'audit_append_failed', detail: audit.error },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    id: data?.id,
    reward_created: false,
    rewards_path: 'disabled_network_evidence_ingest',
  });
}

/** PATCH: actualizar estado ledger (void only — CHECK constraint) y reconciliar rewards. */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  // Schema CHECK: pending|accrued|paid|void — 'reversed' is invalid on ledger rows.
  const status = body?.status === 'void' ? 'void' : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : 'ledger_status_update';

  if (!id) return NextResponse.json({ error: 'id obligatorio' }, { status: 400 });
  if (!status) {
    return NextResponse.json({ error: 'status void requerido' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { error: updErr } = await supabase
    .from('affiliate_ledger_entries')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updErr) {
    return NextResponse.json({ error: 'No se pudo actualizar la comisión' }, { status: 500 });
  }

  const { reconcileRewardsForLedgerStatus } = await import('@/lib/rewards/ledgerReconciliation');
  const reconciled = await reconcileRewardsForLedgerStatus(supabase, id, auth.user.id, reason);

  return NextResponse.json({ ok: true, reconciliation: reconciled });
}

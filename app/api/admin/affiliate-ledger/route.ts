import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { affiliateLedgerInsertSchema } from '@/lib/commissions/affiliateLedger';
import { fingerprintLedgerRow } from '@/lib/commissions/ledgerFingerprint';
import { tryCreateRewardFromLedgerRow, type LedgerRowForReward } from '@/lib/rewards/processLedger';
import type { AffiliateNetworkId } from '@/lib/rewards/adapters/types';

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

/** POST: alta manual de un movimiento (reporte descargado de Amazon, ML, etc.). */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
    meta: row.meta ?? {},
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

  let rewardCreated = false;
  if (data?.id) {
    const row = data as LedgerRowForReward;
    const reward = await tryCreateRewardFromLedgerRow(supabase, {
      id: row.id,
      network: row.network as AffiliateNetworkId,
      amount_cents: Number(row.amount_cents),
      status: row.status,
      external_ref: row.external_ref,
      notes: row.notes,
      meta: row.meta as Record<string, unknown>,
      created_at: row.created_at,
      tracking_tag: row.tracking_tag,
      offer_id: (row as { offer_id?: string | null }).offer_id ?? null,
      creator_id: (row as { creator_id?: string | null }).creator_id ?? null,
      click_id: (row as { click_id?: string | null }).click_id ?? null,
    });
    rewardCreated = reward.created;
  }

  return NextResponse.json({ ok: true, id: data?.id, reward_created: rewardCreated });
}

/** PATCH: actualizar estado ledger (void) y reconciliar rewards. */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  const status = body?.status === 'void' || body?.status === 'reversed' ? body.status : null;
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : 'ledger_status_update';

  if (!id) return NextResponse.json({ error: 'id obligatorio' }, { status: 400 });
  if (!status) {
    return NextResponse.json({ error: 'status void|reversed requerido' }, { status: 400 });
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

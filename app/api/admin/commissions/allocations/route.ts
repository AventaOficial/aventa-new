import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  findAllDuplicateRfcs,
  loadFiscalProfilesByUserIds,
} from '@/lib/server/commissionFiscal';
import { evaluatePayoutReadiness, maskClabe, maskRfc } from '@/lib/commissions/fraudSignals';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { COMMISSION_TERMS_VERSION } from '@/lib/commissions/constants';

function hasMissingTable(error: { message?: string } | null, tableLike: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(tableLike.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

type AllocationRow = {
  id: string;
  pool_id: string;
  user_id: string;
  points: number;
  amount_cents: number;
  status: string;
  paid_at: string | null;
  notes?: string | null;
  meta?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

/** Listado de asignaciones por pool con datos fiscales y señales anti-fraude. */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const poolId = url.searchParams.get('pool_id')?.trim() ?? '';
  if (!poolId) {
    return NextResponse.json({ error: 'pool_id es obligatorio' }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('commission_allocations')
    .select('id, pool_id, user_id, points, amount_cents, status, paid_at, notes, meta, created_at, updated_at')
    .eq('pool_id', poolId)
    .order('amount_cents', { ascending: false });

  if (error) {
    if (hasMissingTable(error, 'commission_allocations')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo listar asignaciones' }, { status: 500 });
  }

  const rows = (data ?? []) as AllocationRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
  const rfcs = [...profiles.values()].map((p) => p.rfc).filter(Boolean) as string[];
  const duplicateRfcs = await findAllDuplicateRfcs(supabase, rfcs);
  const programActive = isCommissionProgramPubliclyActive();

  const allocations = rows.map((row) => {
    const prof = profiles.get(row.user_id);
    const fiscal = prof ?? {
      legalName: null,
      rfc: null,
      clabe: null,
      updatedAt: null,
      acceptedAt: null,
      termsVersion: null,
    };
    const duplicateRfc = fiscal.rfc ? duplicateRfcs.has(fiscal.rfc.toUpperCase()) : false;
    const readiness = evaluatePayoutReadiness({
      fiscal,
      duplicateRfc,
      termsAccepted: !!fiscal.acceptedAt,
      termsVersionCurrent: fiscal.termsVersion === COMMISSION_TERMS_VERSION,
      programPubliclyActive: programActive,
    });

    return {
      ...row,
      display_name: fiscal.legalName,
      fiscal: {
        legal_name: fiscal.legalName,
        rfc_masked: maskRfc(fiscal.rfc),
        clabe_masked: maskClabe(fiscal.clabe),
        fiscal_complete: readiness.ready || !readiness.flags.includes('missing_fiscal'),
      },
      payout: readiness,
    };
  });

  const summary = {
    total: allocations.length,
    ready_to_pay: allocations.filter((a) => a.payout.ready && a.status === 'pending').length,
    blocked: allocations.filter((a) => !a.payout.ready && a.status === 'pending').length,
    program_publicly_active: programActive,
  };

  return NextResponse.json({ allocations, summary });
}

/**
 * Actualización masiva de estatus (pending|paid|void).
 * Marcar paid exige checklist fiscal anti-fraude por cada asignación.
 */
export async function PATCH(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const status = body?.status;
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null;
  const force = body?.force === true;

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids es obligatorio' }, { status: 400 });
  }
  if (status !== 'pending' && status !== 'paid' && status !== 'void') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const supabase = createServerClient();

  if (status === 'paid' && !force) {
    const { data: rows, error: readError } = await supabase
      .from('commission_allocations')
      .select('id, user_id, amount_cents, status, meta')
      .in('id', ids);

    if (readError) {
      return NextResponse.json({ error: 'No se pudieron leer asignaciones' }, { status: 500 });
    }

    const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
    const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
    const rfcs = [...profiles.values()].map((p) => p.rfc).filter(Boolean) as string[];
    const duplicateRfcs = await findAllDuplicateRfcs(supabase, rfcs);
    const programActive = isCommissionProgramPubliclyActive();
    const nowMs = Date.now();

    const blocked: Array<{ id: string; user_id: string; reasons: string[] }> = [];
    for (const row of rows ?? []) {
      const r = row as {
        id: string;
        user_id: string;
        status: string;
        amount_cents?: number;
        meta?: { hold_release_at?: string; below_minimum?: boolean } | null;
      };
      if (r.status === 'paid') continue;
      const reasons: string[] = [];

      const holdAt = r.meta?.hold_release_at;
      if (holdAt) {
        const holdMs = Date.parse(holdAt);
        if (Number.isFinite(holdMs) && nowMs < holdMs) {
          reasons.push(`Hold activo hasta ${holdAt.slice(0, 10)}`);
        }
      }
      if (r.meta?.below_minimum) {
        reasons.push('Monto bajo el mínimo de payout ($200 MXN); espera carry del siguiente periodo');
      }

      const prof = profiles.get(r.user_id);
      const fiscal = prof ?? {
        legalName: null,
        rfc: null,
        clabe: null,
        updatedAt: null,
        acceptedAt: null,
        termsVersion: null,
      };
      const readiness = evaluatePayoutReadiness({
        fiscal,
        duplicateRfc: fiscal.rfc ? duplicateRfcs.has(fiscal.rfc.toUpperCase()) : false,
        termsAccepted: !!fiscal.acceptedAt,
        termsVersionCurrent: fiscal.termsVersion === COMMISSION_TERMS_VERSION,
        programPubliclyActive: programActive,
      });
      const hardBlock = readiness.flags.filter(
        (f) => f !== 'missing_clabe' && f !== 'not_program_active',
      );
      if (hardBlock.length > 0) {
        reasons.push(...readiness.labels);
      }
      if (reasons.length > 0) {
        blocked.push({ id: r.id, user_id: r.user_id, reasons });
      }
    }

    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: 'Hay asignaciones bloqueadas por hold, mínimo o checklist fiscal. Corrige o usa force solo si confirmas el riesgo.',
          blocked,
        },
        { status: 409 },
      );
    }
  }

  const payload: { status: 'pending' | 'paid' | 'void'; paid_at: string | null; notes?: string | null } = {
    status,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
  };
  if (notes !== null) payload.notes = notes;

  const { error } = await supabase.from('commission_allocations').update(payload).in('id', ids);
  if (error) {
    if (hasMissingTable(error, 'commission_allocations')) {
      return NextResponse.json(
        {
          error:
            'Falta migración SQL. Ejecuta docs/supabase-migrations/commissions_pools_allocations.sql',
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'No se pudo actualizar asignaciones' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: ids.length, status, forced: force && status === 'paid' });
}

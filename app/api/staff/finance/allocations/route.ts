import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireFinanceRead, requireFinanceWrite, canFinanceWrite } from '@/lib/staff/requireFinanceStaff';
import {
  findAllDuplicateRfcs,
  loadFiscalProfilesByUserIds,
} from '@/lib/server/commissionFiscal';
import { evaluatePayoutReadiness, maskClabe, maskRfc } from '@/lib/commissions/fraudSignals';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { COMMISSION_TERMS_VERSION } from '@/lib/commissions/constants';

function hasMissingTable(error: { message?: string } | null, table: string): boolean {
  const m = (error?.message ?? '').toLowerCase();
  return m.includes(table.toLowerCase()) || m.includes('does not exist') || m.includes('schema cache');
}

export async function GET(request: Request) {
  const auth = await requireFinanceRead(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const poolId = url.searchParams.get('pool_id')?.trim() ?? '';
  const statusFilter = url.searchParams.get('status')?.trim();

  const supabase = createServerClient();

  if (!poolId) {
    let q = supabase
      .from('commission_allocations')
      .select('id, pool_id, user_id, amount_cents, status, paid_at, notes, meta, created_at')
      .order('amount_cents', { ascending: false })
      .limit(50);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter || 'pending');

    const { data, error } = await q;

    if (error) {
      if (hasMissingTable(error, 'commission_allocations')) {
        return NextResponse.json({ allocations: [], summary: null, tableAvailable: false });
      }
      return NextResponse.json({ error: 'No se pudo listar' }, { status: 500 });
    }

    const rows = data ?? [];
    const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
    const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
    const allocations = rows.map((row) => {
      const prof = profiles.get((row as { user_id: string }).user_id);
      return {
        ...row,
        display_name: prof?.legalName ?? null,
        fiscal: {
          rfc_masked: maskRfc(prof?.rfc ?? null),
          clabe_masked: maskClabe(prof?.clabe ?? null),
        },
      };
    });

    return NextResponse.json({
      allocations,
      canWrite: canFinanceWrite(auth.role),
      tableAvailable: true,
    });
  }

  const { data, error } = await supabase
    .from('commission_allocations')
    .select('id, pool_id, user_id, points, amount_cents, status, paid_at, notes, meta, created_at')
    .eq('pool_id', poolId)
    .order('amount_cents', { ascending: false });

  if (error) {
    if (hasMissingTable(error, 'commission_allocations')) {
      return NextResponse.json({ allocations: [], summary: null, tableAvailable: false });
    }
    return NextResponse.json({ error: 'No se pudo listar asignaciones' }, { status: 500 });
  }

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
  const rfcs = [...profiles.values()].map((p) => p.rfc).filter(Boolean) as string[];
  const duplicateRfcs = await findAllDuplicateRfcs(supabase, rfcs);
  const programActive = isCommissionProgramPubliclyActive();

  const allocations = rows.map((row) => {
    const r = row as { user_id: string; status: string; meta?: Record<string, unknown> | null };
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
    return {
      ...row,
      display_name: fiscal.legalName,
      fiscal: {
        legal_name: fiscal.legalName,
        rfc_masked: maskRfc(fiscal.rfc),
        clabe_masked: maskClabe(fiscal.clabe),
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

  return NextResponse.json({ allocations, summary, canWrite: canFinanceWrite(auth.role), tableAvailable: true });
}

export async function PATCH(request: Request) {
  const auth = await requireFinanceWrite(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];
  const status = body?.status;
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null;

  if (ids.length === 0) return NextResponse.json({ error: 'ids obligatorio' }, { status: 400 });
  if (status !== 'pending' && status !== 'paid' && status !== 'void') {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  if (body?.force === true && auth.role === 'finance') {
    return NextResponse.json({ error: 'Solo owner/admin puede forzar pagos' }, { status: 403 });
  }

  const supabase = createServerClient();

  if (status === 'paid') {
    const { data: rows, error: readError } = await supabase
      .from('commission_allocations')
      .select('id, user_id, status, meta')
      .in('id', ids);

    if (readError) return NextResponse.json({ error: 'No se pudieron leer asignaciones' }, { status: 500 });

    const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
    const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
    const rfcs = [...profiles.values()].map((p) => p.rfc).filter(Boolean) as string[];
    const duplicateRfcs = await findAllDuplicateRfcs(supabase, rfcs);
    const programActive = isCommissionProgramPubliclyActive();
    const nowMs = Date.now();
    const blocked: Array<{ id: string; reasons: string[] }> = [];

    for (const row of rows ?? []) {
      const r = row as { id: string; user_id: string; status: string; meta?: { hold_release_at?: string; below_minimum?: boolean } | null };
      if (r.status === 'paid') continue;
      const reasons: string[] = [];
      const holdAt = r.meta?.hold_release_at;
      if (holdAt) {
        const holdMs = Date.parse(holdAt);
        if (Number.isFinite(holdMs) && nowMs < holdMs) reasons.push(`Hold hasta ${holdAt.slice(0, 10)}`);
      }
      if (r.meta?.below_minimum) reasons.push('Bajo mínimo de payout');
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
      const hardBlock = readiness.flags.filter((f) => f !== 'missing_clabe' && f !== 'not_program_active');
      if (hardBlock.length > 0) reasons.push(...readiness.labels);
      if (reasons.length > 0) blocked.push({ id: r.id, reasons });
    }

    if (blocked.length > 0 && body?.force !== true) {
      return NextResponse.json({ error: 'Asignaciones bloqueadas por checklist fiscal', blocked }, { status: 409 });
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
      return NextResponse.json({ error: 'Migración pendiente' }, { status: 503 });
    }
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: ids.length, status });
}

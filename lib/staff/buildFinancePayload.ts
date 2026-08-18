import { createServerClient } from '@/lib/supabase/server';
import type { Role } from '@/lib/admin/roles';
import { isCommissionProgramPubliclyActive } from '@/lib/commissions/programStatus';
import { loadFiscalProfilesByUserIds } from '@/lib/server/commissionFiscal';
import { staffTasksConfigKey } from '@/lib/staff/departments';
import {
  parseStaffWorkBoard,
  seedDefaultTasks,
  taskCompletionPct,
  type StaffWorkBoard,
} from '@/lib/staff/workBoard';
import { canFinanceWrite } from '@/lib/staff/requireFinanceStaff';

export type FinanceLedgerRow = {
  id: string;
  network: string;
  amount_cents: number;
  status: string;
  tracking_tag?: string | null;
  external_ref?: string | null;
  notes?: string | null;
  attributable?: boolean;
  created_at: string;
  period_start?: string | null;
  period_end?: string | null;
};

export type FinancePoolRow = {
  id: string;
  period_key: string;
  gross_affiliate_cents: number;
  creator_share_bps: number;
  distributable_cents: number;
  status: string;
  created_at: string;
};

export type FinanceAllocationPreview = {
  id: string;
  pool_id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  display_name?: string | null;
  notes?: string | null;
  payout_ready?: boolean;
};

export type FinancePayload = {
  generatedAt: string;
  greeting: string;
  role: Role;
  canWrite: boolean;
  programActive: boolean;
  board: StaffWorkBoard;
  taskPct: number;
  summary: {
    ledgerMonthCents: number;
    ledgerAccruedCents: number;
    pendingCount: number;
    pendingCents: number;
    paidMonthCents: number;
  };
  recentLedger: FinanceLedgerRow[];
  pools: FinancePoolRow[];
  pendingPreview: FinanceAllocationPreview[];
};

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

function greeting(displayName: string | null): string {
  const name = displayName?.trim() || 'equipo';
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  return `${time}, ${name}. Aquí está el estado financiero operativo de AVENTA.`;
}

async function loadBoard(): Promise<StaffWorkBoard> {
  const supabase = createServerClient();
  const key = staffTasksConfigKey('contabilidad');
  const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
  let board = parseStaffWorkBoard(data?.value, 'contabilidad');
  if (board.tasks.length === 0) board = { ...board, tasks: seedDefaultTasks('contabilidad') };
  return board;
}

export async function buildFinancePayload(role: Role, displayName: string | null): Promise<FinancePayload> {
  const supabase = createServerClient();
  const since = monthStartIso();
  const board = await loadBoard();

  const [ledgerRes, pendingRes, poolsRes, recentRes] = await Promise.all([
    supabase
      .from('affiliate_ledger_entries')
      .select('amount_cents, status, created_at')
      .gte('created_at', since),
    supabase
      .from('commission_allocations')
      .select('id, pool_id, user_id, amount_cents, status, notes')
      .eq('status', 'pending')
      .order('amount_cents', { ascending: false })
      .limit(20),
    supabase
      .from('commission_pools')
      .select('id, period_key, gross_affiliate_cents, creator_share_bps, distributable_cents, status, created_at')
      .order('period_key', { ascending: false })
      .limit(12),
    supabase
      .from('affiliate_ledger_entries')
      .select(
        'id, network, amount_cents, status, tracking_tag, external_ref, notes, attributable, created_at, period_start, period_end'
      )
      .order('created_at', { ascending: false })
      .limit(25),
  ]);

  let ledgerMonthCents = 0;
  let ledgerAccruedCents = 0;
  let paidMonthCents = 0;
  for (const row of ledgerRes.data ?? []) {
    const cents = Number((row as { amount_cents?: number }).amount_cents) || 0;
    const st = String((row as { status?: string }).status ?? '');
    ledgerMonthCents += cents;
    if (st === 'accrued') ledgerAccruedCents += cents;
    if (st === 'paid') paidMonthCents += cents;
  }

  const pendingRows = (pendingRes.data ?? []) as FinanceAllocationPreview[];
  const pendingCents = pendingRows.reduce((s, r) => s + (Number(r.amount_cents) || 0), 0);

  const userIds = [...new Set(pendingRows.map((r) => r.user_id))];
  if (userIds.length > 0) {
    const profiles = await loadFiscalProfilesByUserIds(supabase, userIds);
    for (const row of pendingRows) {
      row.display_name = profiles.get(row.user_id)?.legalName ?? null;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    greeting: greeting(displayName),
    role,
    canWrite: canFinanceWrite(role),
    programActive: isCommissionProgramPubliclyActive(),
    board,
    taskPct: taskCompletionPct(board.tasks),
    summary: {
      ledgerMonthCents,
      ledgerAccruedCents,
      pendingCount: pendingRows.length,
      pendingCents,
      paidMonthCents,
    },
    recentLedger: (recentRes.data ?? []) as FinanceLedgerRow[],
    pools: (poolsRes.data ?? []) as FinancePoolRow[],
    pendingPreview: pendingRows,
  };
}

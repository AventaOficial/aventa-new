import type { SupabaseClient, User } from '@supabase/supabase-js';
import { parseDespensaBudget, type DespensaBudget } from '@/lib/despensa/budget';

/**
 * Dónde vive el presupuesto:
 * - Con sesión: `user_metadata.despensa_budget` (Supabase Auth). Solo la propia cuenta lo
 *   escribe con su sesión; no se expone en perfiles públicos ni en `profiles`.
 * - Sin sesión: `localStorage` del dispositivo.
 * Al guardar con sesión se borra la copia local para no dejarla en equipos compartidos.
 */
export const DESPENSA_BUDGET_METADATA_KEY = 'despensa_budget';
export const DESPENSA_BUDGET_LOCAL_KEY = 'aventa:despensa-budget:v1';
export const DESPENSA_BUDGET_DISMISSED_KEY = 'aventa:despensa-budget:dismissed';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readAccountBudget(user: Pick<User, 'user_metadata'> | null | undefined): DespensaBudget | null {
  return parseDespensaBudget(user?.user_metadata?.[DESPENSA_BUDGET_METADATA_KEY]);
}

export function readLocalBudget(): DespensaBudget | null {
  const raw = storage()?.getItem(DESPENSA_BUDGET_LOCAL_KEY);
  if (!raw) return null;
  try {
    return parseDespensaBudget(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalBudget(budget: DespensaBudget | null): void {
  const s = storage();
  if (!s) return;
  try {
    if (budget) s.setItem(DESPENSA_BUDGET_LOCAL_KEY, JSON.stringify(budget));
    else s.removeItem(DESPENSA_BUDGET_LOCAL_KEY);
  } catch {
    /* almacenamiento lleno o bloqueado: el presupuesto queda solo en memoria */
  }
}

export function readBudgetDismissed(): boolean {
  return storage()?.getItem(DESPENSA_BUDGET_DISMISSED_KEY) === '1';
}

export function writeBudgetDismissed(dismissed: boolean): void {
  const s = storage();
  if (!s) return;
  try {
    if (dismissed) s.setItem(DESPENSA_BUDGET_DISMISSED_KEY, '1');
    else s.removeItem(DESPENSA_BUDGET_DISMISSED_KEY);
  } catch {
    /* ignorado */
  }
}

/** Con sesión, la cuenta manda; sin sesión, el dispositivo. */
export function resolveStoredBudget(user: Pick<User, 'user_metadata'> | null | undefined): DespensaBudget | null {
  return user ? readAccountBudget(user) : readLocalBudget();
}

export async function persistBudget(
  budget: DespensaBudget | null,
  ctx: { signedIn: boolean; supabase?: Pick<SupabaseClient, 'auth'> | null },
): Promise<{ ok: true } | { ok: false }> {
  if (!ctx.signedIn) {
    writeLocalBudget(budget);
    return { ok: true };
  }
  if (!ctx.supabase) return { ok: false };
  const { error } = await ctx.supabase.auth.updateUser({ data: { [DESPENSA_BUDGET_METADATA_KEY]: budget } });
  if (error) return { ok: false };
  writeLocalBudget(null);
  return { ok: true };
}

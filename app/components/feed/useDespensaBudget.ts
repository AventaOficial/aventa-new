'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useHydrated } from '@/lib/hooks/useHydrated';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { DespensaBudget } from '@/lib/despensa/budget';
import {
  persistBudget,
  readBudgetDismissed,
  resolveStoredBudget,
  writeBudgetDismissed,
} from '@/lib/despensa/budgetStore';

export type DespensaBudgetSurface = 'dia_a_dia' | 'me_intereses' | 'despensa';

function track(
  token: string | null | undefined,
  surface: DespensaBudgetSurface,
  budget: DespensaBudget | null,
): void {
  if (!token) return;
  void fetch('/api/me/interests/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      budget
        ? { name: 'interest_saved', kind: 'despensa_budget', horizon: budget.horizon, tier: budget.tier, surface }
        : { name: 'interest_removed', kind: 'despensa_budget', surface },
    ),
  }).catch(() => undefined);
}

/** Presupuesto de despensa de la sesión actual o del dispositivo. */
export function useDespensaBudget(surface: DespensaBudgetSurface) {
  const { user, session, isLoading } = useAuth();
  const hydrated = useHydrated();
  const ready = hydrated && !isLoading;
  const [saving, setSaving] = useState(false);
  const [, setRevision] = useState(0);
  // Supabase puede tardar en reflejar user_metadata tras updateUser; lo guardado manda para esa misma cuenta.
  const [saved, setSaved] = useState<{ userId: string | null; value: DespensaBudget | null } | null>(null);

  const userId = user?.id ?? null;
  const current = !ready ? null : saved && saved.userId === userId ? saved.value : resolveStoredBudget(user);
  // La sesión se renueva con objetos nuevos; derivar por contenido evita reordenar el feed sin cambios.
  const budgetKey = current ? JSON.stringify(current) : '';
  const budget = useMemo(() => (budgetKey ? (JSON.parse(budgetKey) as DespensaBudget) : null), [budgetKey]);
  const dismissed = ready && readBudgetDismissed();

  const save = useCallback(
    async (next: DespensaBudget | null): Promise<boolean> => {
      setSaving(true);
      const signedIn = Boolean(user);
      const result = await persistBudget(next, {
        signedIn,
        supabase: signedIn && isSupabaseConfigured() ? createClient() : null,
      });
      setSaving(false);
      if (!result.ok) return false;
      setSaved({ userId: user?.id ?? null, value: next });
      if (next) writeBudgetDismissed(false);
      track(session?.access_token, surface, next);
      return true;
    },
    [user, session?.access_token, surface],
  );

  const dismiss = useCallback(() => {
    writeBudgetDismissed(true);
    setRevision((r) => r + 1);
  }, []);

  const reopen = useCallback(() => {
    writeBudgetDismissed(false);
    setRevision((r) => r + 1);
  }, []);

  return { budget, dismissed, ready, saving, save, dismiss, reopen, signedIn: Boolean(user) };
}

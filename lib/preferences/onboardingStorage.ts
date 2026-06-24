/** Preferencias elegidas en onboarding antes de tener sesión confirmada. */
export const ONBOARDING_PREFERENCES_STORAGE_KEY = 'onboarding_selected_categories';

export function readOnboardingSelectionsFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ONBOARDING_PREFERENCES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .map((x) => x.trim());
  } catch {
    return [];
  }
}

export function writeOnboardingSelectionsToStorage(selections: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ONBOARDING_PREFERENCES_STORAGE_KEY, JSON.stringify(selections));
  } catch {
    // ignore quota / private mode
  }
}

export function clearOnboardingSelectionsFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ONBOARDING_PREFERENCES_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export type SyncOnboardingPreferencesResult =
  | { synced: true; preferred_categories: string[]; merged: boolean }
  | { synced: false; reason: 'no_pending' | 'unauthorized' | 'api_error' };

/**
 * Sincroniza preferencias pendientes del onboarding al perfil (idempotente).
 * Solo escribe si hay datos en localStorage; los limpia tras éxito.
 */
export async function syncOnboardingPreferencesToProfile(
  accessToken: string,
): Promise<SyncOnboardingPreferencesResult> {
  const selections = readOnboardingSelectionsFromStorage();
  if (selections.length === 0) {
    return { synced: false, reason: 'no_pending' };
  }

  const res = await fetch('/api/me/preferred-categories/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ selections }),
  });

  if (res.status === 401) {
    return { synced: false, reason: 'unauthorized' };
  }

  if (!res.ok) {
    return { synced: false, reason: 'api_error' };
  }

  const data = (await res.json().catch(() => ({}))) as {
    preferred_categories?: string[];
    merged?: boolean;
  };

  clearOnboardingSelectionsFromStorage();
  return {
    synced: true,
    preferred_categories: Array.isArray(data.preferred_categories) ? data.preferred_categories : selections,
    merged: data.merged === true,
  };
}

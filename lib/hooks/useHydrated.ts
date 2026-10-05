'use client';

import { useSyncExternalStore } from 'react';

const subscribeNoop = () => () => {};

/**
 * `false` en el servidor y durante la hidratación; `true` después.
 * Para texto que depende del reloj o del navegador sin provocar desajustes de hidratación.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

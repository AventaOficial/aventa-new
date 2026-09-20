/**
 * CazaOfertasss — FASE 3.2. Tracking registry.
 *
 * Resuelve trackingLabel → publication identity.
 * Una publication puede tener múltiples observations (labels/campañas).
 * El título NUNCA es identidad.
 */

import type { CazaResult } from '../types';
import { failResult, okResult } from '../types';
import {
  buildTrackingIdentity,
  type BuildTrackingIdentityInput,
  type TrackingIdentity,
} from './identity';

export interface TrackingRegistryResolveResult {
  readonly trackingLabel: string;
  readonly matches: readonly TrackingIdentity[];
}

export interface TrackingRegistryPort {
  /** Registra una observation. Replay misma identityKey ⇒ duplicate. */
  register(
    identity: TrackingIdentity
  ): Promise<{ registered: boolean; duplicate: boolean }>;
  /** Todas las observations para un label (0..n). */
  resolveByTrackingLabel(trackingLabel: string): Promise<TrackingRegistryResolveResult>;
  /** Observations de una publication (múltiples labels/campañas posibles). */
  listByPublicationId(
    publicationId: string,
    limit: number
  ): Promise<readonly TrackingIdentity[]>;
  findByIdentityKey(identityKey: string): Promise<TrackingIdentity | null>;
}

/**
 * Valida + registra. No muta el ledger ni el historial de publication records.
 */
export async function registerTrackingIdentity(
  registry: TrackingRegistryPort,
  input: BuildTrackingIdentityInput
): Promise<
  CazaResult<{ identity: TrackingIdentity; registered: boolean; duplicate: boolean }>
> {
  const built = buildTrackingIdentity(input);
  if (!built.ok) return failResult(built.reasons);
  const result = await registry.register(built.value);
  return okResult({ identity: built.value, ...result });
}

/**
 * InMemory registry con mutex por label para resolución concurrente.
 */
export function createInMemoryTrackingRegistry(): TrackingRegistryPort & {
  size(): number;
  /** Test-only: mutación de observation existente prohibida. */
  tryMutate(identityKey: string): Promise<never>;
} {
  const byKey = new Map<string, TrackingIdentity>();
  const byLabel = new Map<string, Set<string>>();
  const byPublication = new Map<string, Set<string>>();
  const tails = new Map<string, Promise<unknown>>();

  async function withLock<T>(key: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = prev.then(() => gate);
    tails.set(
      key,
      next.catch(() => undefined)
    );
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (tails.get(key) === next) tails.delete(key);
    }
  }

  return {
    async register(identity) {
      return withLock(identity.trackingLabel, async () => {
        if (byKey.has(identity.identityKey)) {
          return { registered: false, duplicate: true };
        }
        byKey.set(identity.identityKey, identity);

        const labelSet = byLabel.get(identity.trackingLabel) ?? new Set();
        labelSet.add(identity.identityKey);
        byLabel.set(identity.trackingLabel, labelSet);

        const pubSet = byPublication.get(identity.publicationId) ?? new Set();
        pubSet.add(identity.identityKey);
        byPublication.set(identity.publicationId, pubSet);

        return { registered: true, duplicate: false };
      });
    },

    async resolveByTrackingLabel(trackingLabel) {
      return withLock(trackingLabel, async () => {
        const keys = byLabel.get(trackingLabel) ?? new Set();
        const matches = [...keys]
          .map((k) => byKey.get(k)!)
          .filter(Boolean)
          .sort((a, b) => (a.identityKey < b.identityKey ? -1 : 1));
        return { trackingLabel, matches };
      });
    },

    async listByPublicationId(publicationId, limit) {
      const safe = Math.max(1, Math.min(limit, 500));
      const keys = byPublication.get(publicationId) ?? new Set();
      return [...keys]
        .map((k) => byKey.get(k)!)
        .filter(Boolean)
        .sort((a, b) => (a.identityKey < b.identityKey ? -1 : 1))
        .slice(0, safe);
    },

    async findByIdentityKey(identityKey) {
      return byKey.get(identityKey) ?? null;
    },

    size() {
      return byKey.size;
    },

    async tryMutate() {
      throw new Error('caza.tracking_registry.append_only:mutate_forbidden');
    },
  };
}

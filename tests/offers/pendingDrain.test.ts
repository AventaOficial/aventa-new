import { describe, it, expect } from 'vitest';
import {
  classifyDuplicateOfferRow,
  duplicateRowAgeHours,
  offerRowBlocksHunterDuplicate,
  PENDING_STALE_AFTER_HOURS,
} from '@/lib/offers/findDuplicateOffer';
import { countDuplicateKinds, countSupplyOpportunities } from '@/lib/bots/ingest/duplicateDrain';
import type { IngestSingleResult } from '@/lib/bots/ingest/types';

const NOW = new Date('2026-09-08T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('pending drain: clasificación de duplicados', () => {
  it('pending reciente = pending_fresh (la moderación aún no lo vio)', () => {
    expect(classifyDuplicateOfferRow({ status: 'pending', created_at: hoursAgo(2) }, NOW)).toBe(
      'pending_fresh'
    );
  });

  it('pending justo bajo el cooldown sigue fresh', () => {
    const row = { status: 'pending', created_at: hoursAgo(PENDING_STALE_AFTER_HOURS - 1) };
    expect(classifyDuplicateOfferRow(row, NOW)).toBe('pending_fresh');
  });

  it('pending en el cooldown o más viejo = pending_stale (cola atascada)', () => {
    expect(
      classifyDuplicateOfferRow({ status: 'pending', created_at: hoursAgo(PENDING_STALE_AFTER_HOURS) }, NOW)
    ).toBe('pending_stale');
    expect(classifyDuplicateOfferRow({ status: 'pending', created_at: hoursAgo(240) }, NOW)).toBe(
      'pending_stale'
    );
  });

  it('approved/published vigente = live, sin importar la antigüedad', () => {
    expect(classifyDuplicateOfferRow({ status: 'approved', created_at: hoursAgo(500) }, NOW)).toBe('live');
    expect(classifyDuplicateOfferRow({ status: 'published', created_at: hoursAgo(1) }, NOW)).toBe('live');
  });

  it('pending sin created_at usable = unknown, nunca stale por defecto', () => {
    expect(classifyDuplicateOfferRow({ status: 'pending', created_at: null }, NOW)).toBe('unknown');
    expect(classifyDuplicateOfferRow({ status: 'pending', created_at: 'no-fecha' }, NOW)).toBe('unknown');
    expect(duplicateRowAgeHours({ created_at: 'no-fecha' }, NOW)).toBeNull();
  });

  it('la clasificación no decide el bloqueo: eso lo sigue haciendo offerRowBlocksHunterDuplicate', () => {
    const stale = { status: 'pending', created_at: hoursAgo(500), expires_at: null, deleted_at: null };
    expect(classifyDuplicateOfferRow(stale, NOW)).toBe('pending_stale');
    expect(offerRowBlocksHunterDuplicate(stale, NOW)).toBe(true);
  });

  it('expirada no bloquea aunque su status siga siendo approved', () => {
    const expired = {
      status: 'approved',
      created_at: hoursAgo(100),
      expires_at: hoursAgo(1),
      deleted_at: null,
    };
    expect(offerRowBlocksHunterDuplicate(expired, NOW)).toBe(false);
  });

  it('borrada no bloquea', () => {
    const deleted = { status: 'pending', created_at: hoursAgo(1), deleted_at: hoursAgo(1) };
    expect(offerRowBlocksHunterDuplicate(deleted, NOW)).toBe(false);
  });
});

describe('pending drain: desglose por corrida', () => {
  it('separa cola atascada de reencuentro esperado', () => {
    const results: IngestSingleResult[] = [
      { url: 'a', status: 'duplicate', duplicateKind: 'pending_stale' },
      { url: 'b', status: 'duplicate', duplicateKind: 'pending_stale' },
      { url: 'c', status: 'duplicate', duplicateKind: 'live' },
      { url: 'd', status: 'duplicate' },
      { url: 'e', status: 'inserted', offerId: 'x' },
      { url: 'f', status: 'skipped', reason: 'sin precio original verificable' },
    ];
    expect(countDuplicateKinds(results)).toEqual({ pending_stale: 2, live: 1, unknown: 1 });
  });

  it('sin duplicados devuelve objeto vacío (no se emite la clave en el summary)', () => {
    expect(countDuplicateKinds([{ url: 'a', status: 'inserted', offerId: 'x' }])).toEqual({});
    expect(Object.keys(countDuplicateKinds([]))).toHaveLength(0);
  });

  it('cuenta duplicados bloqueados por una fila ya caducada', () => {
    const results: IngestSingleResult[] = [
      { url: 'a', status: 'duplicate', duplicateKind: 'expired' },
      { url: 'b', status: 'duplicate', duplicateKind: 'live' },
    ];
    expect(countDuplicateKinds(results)).toEqual({ expired: 1, live: 1 });
  });

  it('cuenta la supply desperdiciada sin actuar sobre ella', () => {
    const results: IngestSingleResult[] = [
      { url: 'a', status: 'duplicate', duplicateKind: 'live', supplyOpportunity: true },
      { url: 'b', status: 'duplicate', duplicateKind: 'live', supplyOpportunity: false },
      { url: 'c', status: 'duplicate', duplicateKind: 'pending_stale' },
      { url: 'd', status: 'inserted', offerId: 'x' },
    ];
    expect(countSupplyOpportunities(results)).toBe(1);
    expect(countSupplyOpportunities([])).toBe(0);
  });
});

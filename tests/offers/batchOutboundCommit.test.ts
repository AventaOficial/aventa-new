import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const resolveMock = vi.fn(async (url: string) => `resolved:${url}`);

vi.mock('@/lib/affiliate', () => ({
  resolveAndNormalizeAffiliateOfferUrl: (url: string) => resolveMock(url),
}));

vi.mock('@/lib/offers/findDuplicateOffer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offers/findDuplicateOffer')>();
  return {
    ...actual,
    findDuplicateOfferByUrl: async () => null,
    strongProductFingerprintForUrl: () => null,
    isUniqueViolation: () => false,
  };
});

vi.mock('@/lib/server/offerAutoApprove', () => ({
  resolveOfferAutoApproveForUser: async () => null,
}));

import { createCommunityOfferPending } from '@/lib/offers/createCommunityOffer';
import {
  buildOfferBodyFromItem,
  persistedBatchOutbound,
  type OfferBatchItemRow,
} from '@/lib/offers/batch/service';

function item(outbound: string | null): OfferBatchItemRow {
  return {
    evidence: outbound ? { outbound_url: outbound } : {},
    canonical_url: 'https://www.amazon.com.mx/dp/B0TESTABCD',
    normalized_url: null,
    source_url: 'https://www.amazon.com.mx/dp/B0TESTABCD?tag=old',
    images: ['https://m.media-amazon.com/images/I/71TESTIMG1.jpg'],
    title: 'Kindle',
    store: 'Amazon',
    price: 1999,
    original_price: null,
    hint_note: null,
    category: 'tecnologia',
  } as OfferBatchItemRow;
}

function supabase(inserted: unknown[]) {
  return {
    from() {
      return {
        insert(rows: unknown) {
          inserted.push(rows);
          return {
            select() {
              return { single: async () => ({ data: { id: 'offer-1' }, error: null }) };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
}

describe('outbound persistida en la aprobación', () => {
  beforeEach(() => {
    resolveMock.mockClear();
  });

  it('no vuelve a resolver una outbound https ya guardada', async () => {
    const stored = 'https://www.amazon.com.mx/dp/B0TESTABCD?tag=stored-20';
    const row = item(stored);
    expect(persistedBatchOutbound(row)).toBe(stored);
    expect(buildOfferBodyFromItem(row).offer_url).toBe(stored);
    const inserted: unknown[] = [];
    const result = await createCommunityOfferPending({
      supabase: supabase(inserted),
      createdBy: 'mod-1',
      body: buildOfferBodyFromItem(row),
      offerUrlAlreadyFinal: true,
    });
    expect(result.ok).toBe(true);
    expect(resolveMock).not.toHaveBeenCalled();
    expect(inserted).toContainEqual([expect.objectContaining({ offer_url: stored })]);
  });

  it('si no hay outbound persistida, aprueba con la función de afiliado existente', async () => {
    const row = item(null);
    expect(persistedBatchOutbound(row)).toBeNull();
    expect(buildOfferBodyFromItem(row).offer_url).toBe('https://www.amazon.com.mx/dp/B0TESTABCD');
    const inserted: unknown[] = [];
    const result = await createCommunityOfferPending({
      supabase: supabase(inserted),
      createdBy: 'mod-1',
      body: buildOfferBodyFromItem(row),
      offerUrlAlreadyFinal: false,
    });
    expect(result.ok).toBe(true);
    expect(resolveMock).toHaveBeenCalledTimes(1);
    expect(resolveMock).toHaveBeenCalledWith('https://www.amazon.com.mx/dp/B0TESTABCD');
    expect(inserted).toContainEqual([
      expect.objectContaining({ offer_url: 'resolved:https://www.amazon.com.mx/dp/B0TESTABCD' }),
    ]);
  });
});

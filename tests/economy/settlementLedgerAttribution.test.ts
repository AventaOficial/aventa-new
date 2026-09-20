import { describe, expect, it } from 'vitest';
import {
  projectLedgerAttributionFromEvidence,
  EMPTY_LEDGER_ATTRIBUTION,
} from '@/lib/economy/settlement/projectLedgerAttribution';
import { encodeAventaSubId } from '@/lib/rewards/adapters/types';

describe('projectLedgerAttributionFromEvidence', () => {
  const offerId = '33333333-3333-3333-3333-333333333333';
  const clickId = '44444444-4444-4444-4444-444444444444';
  const creatorId = '55555555-5555-5555-5555-555555555555';

  it('projects attributed conversion with verified click→offer→creator', () => {
    const p = projectLedgerAttributionFromEvidence({
      conversion: {
        id: 'c1',
        click_id: clickId,
        offer_id: offerId,
        attribution_status: 'attributed',
      },
      offerCreatorId: creatorId,
      clickOfferId: offerId,
    });
    expect(p.attributable).toBe(true);
    expect(p.click_id).toBe(clickId);
    expect(p.offer_id).toBe(offerId);
    expect(p.creator_id).toBe(creatorId);
    expect(p.attribution_method).toBe('sub_id');
    expect(p.attribution_confidence).toBe('high');
    expect(p.tracking_tag).toBe(encodeAventaSubId(offerId, clickId));
    expect(p.source).toBe('conversion_attributed');
  });

  it('unattributed → empty projection', () => {
    const p = projectLedgerAttributionFromEvidence({
      conversion: {
        id: 'c1',
        click_id: null,
        offer_id: offerId,
        attribution_status: 'unattributed',
      },
      offerCreatorId: creatorId,
      clickOfferId: null,
    });
    expect(p).toMatchObject({
      ...EMPTY_LEDGER_ATTRIBUTION,
      source: 'conversion_unattributed',
    });
  });

  it('attributed but click/offer mismatch → empty (fail closed)', () => {
    const p = projectLedgerAttributionFromEvidence({
      conversion: {
        id: 'c1',
        click_id: clickId,
        offer_id: offerId,
        attribution_status: 'attributed',
      },
      offerCreatorId: creatorId,
      clickOfferId: '66666666-6666-6666-6666-666666666666',
    });
    expect(p.attributable).toBe(false);
    expect(p.click_id).toBeNull();
    expect(p.source).toBe('conversion_incomplete');
  });

  it('attributed but missing creator → empty (never invent)', () => {
    const p = projectLedgerAttributionFromEvidence({
      conversion: {
        id: 'c1',
        click_id: clickId,
        offer_id: offerId,
        attribution_status: 'attributed',
      },
      offerCreatorId: null,
      clickOfferId: offerId,
    });
    expect(p.attributable).toBe(false);
    expect(p.creator_id).toBeNull();
    expect(p.source).toBe('conversion_incomplete');
  });
});

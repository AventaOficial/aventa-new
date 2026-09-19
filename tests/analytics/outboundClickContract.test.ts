import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OUTBOUND_EVENT_TYPE,
  OUTBOUND_VOLUME_SOT,
  OUTBOUND_ATTRIBUTION_SOT,
  canAutoAttributeFromClick,
  isVolumeOutboundEvent,
} from '@/lib/analytics/outboundClickContract';

describe('outbound click canonical contract', () => {
  it('define SoT dual-write sin segundo analytics system', () => {
    expect(OUTBOUND_VOLUME_SOT).toBe('offer_events');
    expect(OUTBOUND_ATTRIBUTION_SOT).toBe('reward_outbound_clicks');
    expect(OUTBOUND_EVENT_TYPE).toBe('outbound');
  });

  it('volumen vs atribución', () => {
    expect(isVolumeOutboundEvent({ event_type: 'outbound' })).toBe(true);
    expect(isVolumeOutboundEvent({ event_type: 'view' })).toBe(false);
    expect(canAutoAttributeFromClick(null)).toBe(false);
    expect(canAutoAttributeFromClick('abc')).toBe(true);
  });

  it('track-outbound usa el contrato canónico', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/track-outbound/route.ts'), 'utf8');
    expect(src).toMatch(/outboundClickContract/);
    expect(src).toMatch(/OUTBOUND_EVENT_TYPE/);
    expect(src).toMatch(/recordOfferEvent/);
    // Attribution SoT writer (canonical) — not a second analytics path.
    expect(src).toMatch(/recordAttributedClick/);
  });
});

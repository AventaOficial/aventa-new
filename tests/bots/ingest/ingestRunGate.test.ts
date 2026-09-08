import { describe, expect, it } from 'vitest';
import { ingestRunBlockReason } from '@/lib/bots/ingest/ingestRunGate';

describe('ingestRunGate', () => {
  it('paused gana sobre enabled', () => {
    expect(
      ingestRunBlockReason({ pausedByOwner: true, enabled: true, botUserIdsForQuota: ['x'] })
    ).toBe('paused');
  });

  it('disabled y missing bot user', () => {
    expect(
      ingestRunBlockReason({ pausedByOwner: false, enabled: false, botUserIdsForQuota: ['x'] })
    ).toBe('disabled');
    expect(
      ingestRunBlockReason({ pausedByOwner: false, enabled: true, botUserIdsForQuota: [] })
    ).toBe('missing_bot_user');
  });

  it('null si puede correr', () => {
    expect(
      ingestRunBlockReason({ pausedByOwner: false, enabled: true, botUserIdsForQuota: ['x'] })
    ).toBeNull();
  });
});

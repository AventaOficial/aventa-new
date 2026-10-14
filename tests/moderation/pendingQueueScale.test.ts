import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLAIM_QUEUE_HARD_CAP } from '@/lib/moderation/slaContract';

describe('moderation pending queue scale boundary', () => {
  it('applies the shared hard cap before returning the visual moderation queue', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/admin/moderation-pending-offers/route.ts'),
      'utf8',
    );
    expect(CLAIM_QUEUE_HARD_CAP).toBe(1000);
    expect(route).toContain('.limit(CLAIM_QUEUE_HARD_CAP)');
  });
});

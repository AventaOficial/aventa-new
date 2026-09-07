import { describe, expect, it } from 'vitest';
import { FOCUS_REJECTION_PRESETS, MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';

describe('rejection presets contract', () => {
  it('legacy presets siguen existiendo', () => {
    expect(MODERATION_REJECTION_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(MODERATION_REJECTION_PRESETS.every((p) => p.short && p.full)).toBe(true);
  });

  it('focus presets tienen full strings para la API', () => {
    for (const p of FOCUS_REJECTION_PRESETS) {
      expect(p.full.trim().length).toBeGreaterThan(5);
    }
  });
});

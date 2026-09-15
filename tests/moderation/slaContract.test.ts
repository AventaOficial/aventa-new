import { describe, expect, it } from 'vitest';
import {
  CLAIM_QUEUE_HARD_CAP,
  estimateHoursToDrain,
  formatHoursToDrain,
  isSlaBreached,
  MODERATION_SLA_HOURS,
  slaHoursForPriority,
} from '@/lib/moderation/slaContract';

describe('moderation SLA contract', () => {
  it('define horas por prioridad sin auto-approve', () => {
    expect(MODERATION_SLA_HOURS.P1_HIGH_VALUE).toBe(2);
    expect(MODERATION_SLA_HOURS.P2_REVIEW).toBe(12);
    expect(MODERATION_SLA_HOURS.P3_INSUFFICIENT_EVIDENCE).toBe(24);
    expect(MODERATION_SLA_HOURS.P4_LOW_VALUE).toBe(48);
    expect(slaHoursForPriority('P1_HIGH_VALUE')).toBe(2);
  });

  it('detecta SLA breach por edad', () => {
    expect(isSlaBreached({ priority: 'P1_HIGH_VALUE', ageHours: 1.9 })).toBe(false);
    expect(isSlaBreached({ priority: 'P1_HIGH_VALUE', ageHours: 2 })).toBe(true);
    expect(isSlaBreached({ priority: 'P2_REVIEW', ageHours: 11 })).toBe(false);
    expect(isSlaBreached({ priority: 'P2_REVIEW', ageHours: 12 })).toBe(true);
    expect(isSlaBreached({ priority: 'P1_HIGH_VALUE', ageHours: null })).toBe(false);
  });

  it('estima drenaje y formatea', () => {
    expect(estimateHoursToDrain(0, 10)).toBe(0);
    expect(estimateHoursToDrain(100, 0)).toBeNull();
    expect(estimateHoursToDrain(100, 10)).toBe(10);
    expect(formatHoursToDrain(null)).toBe('NO_DATA');
    expect(formatHoursToDrain(0.4)).toBe('<1h');
    expect(formatHoursToDrain(5)).toBe('5h');
  });

  it('hard cap de claim es finito y escala', () => {
    expect(CLAIM_QUEUE_HARD_CAP).toBe(1000);
    expect(CLAIM_QUEUE_HARD_CAP).toBeLessThanOrEqual(1000);
  });
});

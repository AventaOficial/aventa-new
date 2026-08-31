import { describe, it, expect } from 'vitest';
import {
  FEED_STREAK_ALERT,
  FEED_STREAK_SOURCE,
  isLegitimateFeedStreakAlert,
} from '../../lib/server/clientEventAlerts';

describe('clientEventAlerts', () => {
  it('acepta alerta legítima de feed streak', () => {
    expect(
      isLegitimateFeedStreakAlert('error', FEED_STREAK_SOURCE, {
        alert: FEED_STREAK_ALERT,
        count: 5,
      }),
    ).toBe(true);
  });

  it('rechaza alert spoofed sin source/count válidos', () => {
    expect(
      isLegitimateFeedStreakAlert('error', 'attacker', { alert: FEED_STREAK_ALERT, count: 5 }),
    ).toBe(false);
    expect(
      isLegitimateFeedStreakAlert('vote', FEED_STREAK_SOURCE, { alert: FEED_STREAK_ALERT, count: 5 }),
    ).toBe(false);
    expect(
      isLegitimateFeedStreakAlert('error', FEED_STREAK_SOURCE, { alert: FEED_STREAK_ALERT, count: 2 }),
    ).toBe(false);
  });
});

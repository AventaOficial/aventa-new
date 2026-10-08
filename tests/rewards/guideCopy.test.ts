import { describe, expect, it } from 'vitest';
import { GUIDES } from '@/app/descubre/guides/content';
import { REWARDS_CREATOR_SHARE_BPS, REWARDS_HOLD_DAYS, REWARDS_MIN_PAYOUT_CENTS } from '@/lib/rewards/config';
import { rewardsLevelShareBps } from '@/lib/rewards/levels';

describe('copy de Rewards en la guía', () => {
  it('usa las reglas del código y no abre el programa a cualquier cuenta', () => {
    const guide = GUIDES.find((item) => item.id === 'gana');
    const text = guide?.steps.flatMap((step) => step.body).join('\n') ?? '';
    expect(text).toContain(`${Math.round(REWARDS_CREATOR_SHARE_BPS / 100)}%`);
    expect(text).toContain('Oferta de Bienvenida');
    expect(text).toContain('comisión afiliada atribuida');
    expect(text).not.toMatch(/durante \d+ días/);
    expect(text).not.toContain('desde esa inscripción');
    expect(text).toContain(`${REWARDS_HOLD_DAYS} días`);
    expect(text).toContain(`${Math.round(rewardsLevelShareBps(1) / 100)}%`);
    expect(text).toContain(`${Math.round(rewardsLevelShareBps(8) / 100)}%`);
    expect(text).toContain(String(REWARDS_MIN_PAYOUT_CENTS / 100));
    expect(text).toMatch(/no tiene Rewards activo/);
    expect(text).toMatch(/no cualquier compra/);
    expect(text).not.toMatch(/cualquier compra genera/);
    expect(text).not.toMatch(/todos pueden/);
  });
});

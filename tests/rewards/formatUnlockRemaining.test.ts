import { describe, expect, it } from 'vitest';
import { formatRewardsUnlockRemaining } from '@/lib/rewards/formatUnlockRemaining';

describe('formatRewardsUnlockRemaining', () => {
  it('mensaje cuando ya no faltan requisitos', () => {
    expect(formatRewardsUnlockRemaining(0, 0)).toMatch(/Cumpliste los requisitos/);
  });

  it('solo ofertas pendientes', () => {
    expect(formatRewardsUnlockRemaining(3, 0)).toBe(
      'Te faltan 3 ofertas aprobadas para abrir tu panel de recompensas.',
    );
    expect(formatRewardsUnlockRemaining(2, 0)).toBe(
      'Te faltan 2 ofertas aprobadas para abrir tu panel de recompensas.',
    );
    expect(formatRewardsUnlockRemaining(1, 0)).toBe(
      'Te falta 1 oferta aprobada para abrir tu panel de recompensas.',
    );
  });

  it('solo votos pendientes', () => {
    expect(formatRewardsUnlockRemaining(0, 15)).toBe(
      'Te faltan 15 votos positivos para abrir tu panel de recompensas.',
    );
    expect(formatRewardsUnlockRemaining(0, 1)).toBe(
      'Te falta 1 voto positivo para abrir tu panel de recompensas.',
    );
  });

  it('ofertas y votos pendientes', () => {
    expect(formatRewardsUnlockRemaining(2, 5)).toBe(
      'Te faltan 2 ofertas aprobadas y 5 votos positivos para abrir tu panel de recompensas.',
    );
  });
});

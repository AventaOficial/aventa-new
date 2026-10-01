import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveHunterNextAction } from '@/lib/me/hunterNextAction';
import { explainRewardPresentation, formatRewardShare } from '@/lib/me/rewardStatusCopy';
import { offerDiscountPercent } from '@/lib/me/offerPresentation';
import { presentCreatorReward } from '@/lib/rewards/payoutReadModel';

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('experiencia del cazador', () => {
  it('separa el nivel base del programa de recompensas', () => {
    const progress = source('app/me/dashboard/HunterProgress.tsx');
    const next = source('lib/me/hunterNextAction.ts');
    const nivel = source('app/me/nivel/page.tsx');
    for (const file of [progress, next, nivel]) {
      expect(file).not.toMatch(/creator_rewards|payout_intent|RewardsProgramPanel|paidCents/);
    }
    expect(progress).toMatch(/No es el programa de recompensas/);
    expect(nivel).toMatch(/No mide recompensas/);
    expect(source('app/me/dashboard/HunterProgram.tsx')).not.toMatch(/RewardsProgramPanel/);
    expect(source('app/me/dashboard/HunterProgram.tsx')).toMatch(/\/me\/programa/);
    expect(source('app/me/programa/page.tsx')).toMatch(/RewardsProgramPanel/);
  });

  it('conserva el copy del Programa del Cazador', () => {
    const panel = source('app/me/RewardsProgramPanel.tsx');
    expect(panel).toMatch(/Programa del Cazador/);
    expect(panel).toMatch(/Hay algo/);
    expect(panel).toMatch(/esperándote…/);
  });

  it('no muestra Entregada si el read model no certifica el pago', () => {
    const summary = source('app/me/dashboard/HunterRewardSummary.tsx');
    expect(summary).not.toMatch(/status === 'PAID'/);
    expect(summary).toMatch(/statusLabel/);
    expect(
      presentCreatorReward({
        status: 'PAID',
        synthetic: false,
        certification: {
          intentSucceeded: false,
          rewardPaidAudit: false,
          payoutIntentSucceededAudit: false,
        },
      }).label,
    ).not.toBe('Entregada');
    expect(
      presentCreatorReward({
        status: 'PAID',
        synthetic: false,
        certification: {
          intentSucceeded: true,
          rewardPaidAudit: true,
          payoutIntentSucceededAudit: true,
        },
      }).label,
    ).toBe('Entregada');
  });

  it('el perfil público dentro de /me no carga datos económicos', () => {
    const page = source('app/me/page.tsx');
    const publicView = source('app/me/PublicHallazgosSection.tsx');
    const community = source('app/u/[username]/page.tsx');
    expect(page).toMatch(/Así me ve la comunidad/);
    expect(publicView).not.toMatch(/RewardsProgramPanel|MyRewardsHistory|creator_rewards|ledger|Entregada/);
    expect(community).not.toMatch(/RewardsProgramPanel|creator_rewards|payout_intent|Entregada/);
    expect(community).toMatch(/Así me ve Aventa/);
    expect(source('app/me/dashboard/HunterHeader.tsx')).toMatch(/Cazador/);
    expect(source('app/me/dashboard/HunterHeader.tsx')).not.toMatch(/centro de operaciones/);
    expect(source('app/me/ofertas/page.tsx')).not.toMatch(/storeClicks|creator_share|payout/);
  });

  it('ordena el dashboard para móvil y conserva una cuadrícula en pantallas mayores', () => {
    const dashboard = source('app/me/dashboard/HunterDashboard.tsx');
    expect(dashboard).toMatch(/lg:grid-cols-\[minmax\(0,1\.6fr\)_minmax\(240px,0\.9fr\)\]/);
    expect(dashboard).not.toMatch(/md:grid-cols-2/);
    const next = dashboard.indexOf('<HunterNextAction');
    const progress = dashboard.indexOf('<HunterProgress');
    const offers = dashboard.indexOf('<HunterOffersPreview');
    const rewards = dashboard.indexOf('<HunterRewardSummary');
    const program = dashboard.indexOf('<HunterProgram');
    const activity = dashboard.indexOf('<HunterActivitySummary');
    expect(next).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(-1);
    expect(progress).toBeLessThan(next);
    expect(offers).toBeGreaterThan(next);
    expect(rewards).toBeGreaterThan(offers);
    expect(program).toBeGreaterThan(rewards);
    expect(activity).toBeGreaterThan(program);
    expect(source('app/me/dashboard/useMyRewards.ts')).toMatch(/\/api\/me\/rewards/);
    expect(source('app/me/dashboard/HunterRewardSummary.tsx')).not.toMatch(/fetch\(/);
  });

  it('cubre usuario nuevo, sin ofertas y sin recompensas', () => {
    expect(deriveHunterNextAction({
      published: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      expired: 0,
      publicHref: null,
    }).id).toBe('publish');
    expect(deriveHunterNextAction({
      published: 2,
      approved: 0,
      pending: 0,
      rejected: 1,
      expired: 1,
      publicHref: '/u/ana',
    }).id).toBe('review-rejected');
    expect(source('app/me/dashboard/HunterOffersPreview.tsx')).toMatch(/Nada publicado/);
    expect(source('app/me/dashboard/HunterRewardSummary.tsx')).toMatch(/Todavía no hay recompensas/);
    expect(source('app/me/dashboard/HunterNextAction.tsx')).toMatch(/Tu siguiente acción/);
    expect(source('app/me/dashboard/HunterNextAction.tsx')).not.toMatch(/Continuar/);
    expect(source('app/me/MyRewardsHistory.tsx')).toMatch(/Cuando el programa registre una recompensa/);
    expect(source('app/me/MyRewardsHistory.tsx')).not.toMatch(/\{r\.status\}/);
    expect(source('app/me/ofertas/page.tsx')).toMatch(/Activa/);
    expect(source('app/me/ofertas/page.tsx')).toMatch(/En revisión/);
    expect(source('app/me/ofertas/page.tsx')).toMatch(/Rechazada/);
    expect(source('app/me/ofertas/page.tsx')).toMatch(/Expirada/);
  });

  it('prioriza señales reales de recompensa sin inventar una recomendación', () => {
    const base = {
      published: 2,
      approved: 1,
      pending: 1,
      rejected: 0,
      expired: 0,
      publicHref: '/u/ana',
    };
    expect(deriveHunterNextAction({ ...base, rewards: { validating: 1, ready: 0, any: 1 } }).id).toBe('reward-validating');
    expect(deriveHunterNextAction({ ...base, rewards: { validating: 0, ready: 1, any: 1 } }).cta).toBe('Ver recompensas');
    expect(deriveHunterNextAction({ ...base, published: 0, rewards: { validating: 1, ready: 0, any: 1 } }).id).toBe('publish');
    expect(deriveHunterNextAction(base).id).toBe('review-pending');
  });

  it('explica el estado humano y no inventa monto ni descuento', () => {
    expect(explainRewardPresentation({ uiStatus: 'delivered', statusLabel: 'Entregada' }).meaning).toMatch(/Entregada/);
    expect(explainRewardPresentation({ uiStatus: 'cancelled', statusLabel: 'Revertida' }).meaning).toMatch(/Revertida/);
    expect(explainRewardPresentation({ uiStatus: 'available', statusLabel: 'Lista' }).next).toBeNull();
    expect(formatRewardShare(null, 'MXN')).toBeNull();
    expect(formatRewardShare(1250, null)).toBeNull();
    expect(formatRewardShare(1250, 'MXN')).toMatch(/12\.50/);
    expect(offerDiscountPercent(80, 100)).toBe(20);
    expect(offerDiscountPercent(100, 80)).toBeNull();
    expect(offerDiscountPercent(null, 100)).toBeNull();
    const copy = source('lib/me/rewardStatusCopy.ts');
    expect(copy).not.toMatch(/UNKNOWN|SETTLEMENT|LEDGER|INTENT|AUDIT/);
  });

  it('la siguiente acción y el resumen tienen nombre accesible', () => {
    expect(source('app/me/dashboard/HunterNextAction.tsx')).toMatch(/aria-label="Tu siguiente acción"/);
    expect(source('app/me/dashboard/HunterProgress.tsx')).toMatch(/aria-label="Nivel base de Aventa"/);
    expect(source('app/me/page.tsx')).toMatch(/role="tablist"/);
  });
});

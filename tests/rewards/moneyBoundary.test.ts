/**
 * Frontera de Rewards ↔ Money ↔ Fiscal. No ejecuta dinero: comprueba que la UX
 * no cruza la frontera y que todo movimiento de dinero sigue detrás del freeze.
 * El freeze en ejecución de createManualRewardPayout se prueba en
 * tests/server/moneyPathFreeze.fase01.test.ts.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMoneyPathFrozen } from '@/lib/server/moneyPathFreeze';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(relative(root, full).replace(/\\/g, '/'));
  }
  return out;
}

/** Superficies de usuario final: todo `app/` salvo staff, admin, APIs y páginas legales. */
const userSurfaces = walk(join(root, 'app')).filter(
  (f) => !/^app\/(admin|equipo|team|operaciones|api|terms|privacy)\//.test(f),
);

function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('MONEY_PATH_FROZEN protege producción', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('en producción, sin variable o con valor inválido, queda congelado (fail-closed)', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('MONEY_PATH_FROZEN', '');
    expect(isMoneyPathFrozen()).toBe(true);
    vi.stubEnv('MONEY_PATH_FROZEN', 'quizá');
    expect(isMoneyPathFrozen()).toBe(true);
  });

  it('todo ejecutor de pago consulta el freeze antes de mover dinero', () => {
    const engine = read('lib/rewards/payoutIntent/engine.ts');
    for (const fn of ['reservePayoutIntent', 'submitPayoutIntent', 'applyProviderConfirmation', 'reconcilePayoutIntent']) {
      expect(fnBody(engine, fn), fn).toContain('isMoneyPathFrozen()');
    }
    expect(fnBody(read('lib/rewards/payout.ts'), 'createManualRewardPayout')).toContain('isMoneyPathFrozen()');
    expect(read('lib/rewards/payoutIntent/providerExecute.ts')).toContain('submitPayoutIntent(');
    for (const f of ['lib/economy/settlement/settleCommission.ts', 'lib/rewards/clawback.ts', 'lib/rewards/rewardsEngine.ts']) {
      expect(read(f), f).toContain('isMoneyPathFrozen()');
    }
  });
});

describe('Fiscal boundary: nada fiscal antes de un pago', () => {
  it('ninguna superficie de usuario llama a los endpoints fiscales legacy', () => {
    const offenders = userSurfaces.filter((f) => /\/api\/me\/(commission-fiscal|commissions-accept)/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('ninguna superficie de usuario tiene campos para RFC, CLABE, CSF, e.firma o CSD', () => {
    const field = /<(input|textarea|select)[^>]*(rfc|clabe|csf|efirma|e\.firma|\bcsd\b)/i;
    const offenders = userSurfaces.filter((f) => field.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('el onboarding promete pedir datos fiscales solo cuando haya un pago', () => {
    const src = read('lib/rewards/onboarding.ts');
    expect(src).toMatch(/solo cuando haya un pago que hacerte, nunca antes/);
    expect(src).not.toMatch(/\b(ISR|IVA|RESICO)\b/);
  });
});

describe('Rewards no se mezcla con Sponsored', () => {
  it('el inventario patrocinado no importa nada de rewards ni de dinero', () => {
    for (const f of ['lib/sponsored/placements.ts', 'lib/sponsored/campaigns.ts', 'app/components/HomeSponsored.tsx']) {
      expect(read(f), f).not.toMatch(/@\/lib\/(rewards|economy|commissions)/);
    }
  });
});

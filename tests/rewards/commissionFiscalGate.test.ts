import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('commission-fiscal POST respeta programa y money freeze', () => {
  it('bloquea guardado cuando el programa está apagado o el money path congelado', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/me/commission-fiscal/route.ts'), 'utf8');
    const post = src.slice(src.indexOf('export async function POST'));
    expect(post).toMatch(/isRewardsProgramActive\(\)/);
    expect(post).toMatch(/isCommissionProgramPubliclyActive\(\)/);
    expect(post).toMatch(/isMoneyPathFrozen\(\)/);
    expect(post).toMatch(/program_inactive/);
    expect(post).toMatch(/moneyPathFrozenHttpBody/);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('CI closure — gates de lanzamiento', () => {
  it('ci:verify incluye build de extensión', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: { 'ci:verify': string } };
    expect(pkg.scripts['ci:verify']).toMatch(/build:extension/);
    expect(pkg.scripts['ci:verify'].indexOf('build:extension')).toBeGreaterThan(
      pkg.scripts['ci:verify'].indexOf('npm run build'),
    );
  });

  it('E2E corre en push a master con target local', () => {
    const workflow = read('.github/workflows/e2e.yml');
    expect(workflow).toMatch(/branches:\s*\n\s*-\s*master/);
    expect(workflow).toContain("E2E_TARGET: ${{ github.event_name == 'push' && 'local' || inputs.target }}");
    expect(workflow).toContain("env.E2E_TARGET == 'local'");
  });
});

describe('recompensas — portal del sheet opaco', () => {
  it('SheetFrame no depende de --me-card en el panel del portal', () => {
    const page = read('app/me/recompensas/page.tsx');
    const sheetStart = page.indexOf('function SheetFrame');
    expect(sheetStart).toBeGreaterThan(-1);
    const sheetBlock = page.slice(sheetStart, sheetStart + 2200);
    expect(sheetBlock).toContain('createPortal(sheet, document.body)');
    expect(sheetBlock).toContain('bg-white');
    expect(sheetBlock).toContain('dark:bg-[#141414]');
    expect(sheetBlock).not.toMatch(/bg-\[var\(--me-card\)\]/);
  });
});

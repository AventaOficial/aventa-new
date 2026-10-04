import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_COMMAND_ITEMS, OWNER_NAV_SECTIONS } from '@/lib/owner/navigation';
import { CEO_CARD_DRILLDOWN, TEAM_TOOL_HREF } from '@/app/admin/owner/command/drilldowns';
import { summarizeDecision } from '@/app/admin/owner/command/decision';
import { MOBILE_ORDER } from '@/app/admin/owner/command/ceo/mosaic';
import { FOUNDER_MODULES, findFounderModule } from '@/lib/founderOs/modules';
import { moduleStatus } from '@/lib/founderOs/moduleStatus';
import type { CeoPriority, HealthCategory } from '@/app/admin/owner/command/types';

const root = process.cwd();
const pageExists = (href: string) => existsSync(join(root, 'app', href.split('#')[0]!.replace(/^\//, ''), 'page.tsx'));
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function health(over: Partial<HealthCategory> & Pick<HealthCategory, 'id' | 'level'>): HealthCategory {
  return { label: over.id, summary: 's', signals: [], team: 'producto', updatedAt: null, href: '/admin/health', cta: 'x', ...over };
}

function priority(over: Partial<CeoPriority> & Pick<CeoPriority, 'id' | 'severity'>): CeoPriority {
  return {
    team: 'moderacion',
    problem: 'p',
    reason: 'r',
    impact: 'i',
    quantity: 1,
    action: 'Revisar cola',
    href: '/admin/moderation',
    provenance: 'REAL',
    ...over,
  };
}

describe('Founder OS · navegación por capacidad', () => {
  const allItems = OWNER_NAV_SECTIONS.flatMap((s) => [...s.items, ...(s.more ?? [])]);

  it('tiene una sola entrada y las seis capacidades en orden', () => {
    expect(OWNER_NAV_SECTIONS.map((s) => s.id)).toEqual(['control', 'producto', 'crecimiento', 'negocio', 'salud', 'sistema']);
    expect(OWNER_NAV_SECTIONS[0]!.items.map((i) => i.href)).toEqual(['/admin/owner']);
  });

  it('cada sección responde una pregunta humana y su uso diario es corto', () => {
    for (const s of OWNER_NAV_SECTIONS) {
      expect(s.question).toMatch(/^¿.+\?$/);
      expect(s.items.length).toBeLessThanOrEqual(3);
    }
  });

  it('cada destino existe como página y no se repite', () => {
    for (const item of allItems) expect(pageExists(item.href), item.href).toBe(true);
    const hrefs = allItems.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('las superficies antes huérfanas ya son alcanzables desde el menú', () => {
    const hrefs = allItems.map((i) => i.href);
    for (const h of ['/admin/coupons', '/admin/vote-weights', '/admin/distribution', '/admin/mantenimiento', '/admin/creator-tags', '/admin/announcements', '/admin/owner/cazadores', '/equipo']) {
      expect(hrefs).toContain(h);
    }
  });

  it('no enlaza composiciones de referencia ni Team OS', () => {
    for (const item of allItems) {
      expect(item.href.startsWith('/admin/owner/vista')).toBe(false);
      expect(item.href === '/team' || item.href.startsWith('/team/')).toBe(false);
    }
  });

  it('el buscador cubre exactamente lo navegable', () => {
    expect(OWNER_COMMAND_ITEMS.map((i) => i.href).sort()).toEqual(allItems.map((i) => i.href).sort());
  });

  it('Supply · Hunter ya no se titula como el Control Center', () => {
    expect(read('app/admin/hunter/page.tsx')).not.toMatch(/CEO Control Center/);
  });
});

describe('Founder OS · Control Center', () => {
  it('ninguna tarjeta del CEO lleva a datos de referencia', () => {
    const dir = join(root, 'app/admin/owner/command/ceo');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/\/admin\/owner\/vista/);
    }
    expect(read('app/admin/owner/OwnerDashboardClient.tsx')).not.toMatch(/\/admin\/owner\/vista/);
  });

  it('cada drill-down apunta a una herramienta real', () => {
    for (const href of [...Object.values(CEO_CARD_DRILLDOWN), ...Object.values(TEAM_TOOL_HREF)]) {
      expect(pageExists(href), href).toBe(true);
    }
  });

  it('el resumen de decisión prioriza crítico > atención > sano', () => {
    const ok = [health({ id: 'PRODUCT', level: 'HEALTHY' })];
    expect(summarizeDecision(ok, []).state).toBe('healthy');
    expect(summarizeDecision(ok, []).next).toBeNull();
    expect(summarizeDecision([health({ id: 'PRODUCT', level: 'WARNING' })], []).state).toBe('attention');
    const crit = summarizeDecision(ok, [priority({ id: 'a', severity: 'critical' }), priority({ id: 'b', severity: 'high' })]);
    expect(crit).toMatchObject({ state: 'critical', critical: 1, high: 1 });
    expect(crit.next?.id).toBe('a');
  });

  it('congelado es intencional y sin datos no se presenta como sano', () => {
    expect(summarizeDecision([health({ id: 'MONETIZATION', level: 'FROZEN' }), health({ id: 'PRODUCT', level: 'HEALTHY' })], []).state).toBe('healthy');
    expect(summarizeDecision([health({ id: 'PRODUCT', level: 'UNKNOWN' })], []).state).toBe('unknown');
    expect(summarizeDecision([], [priority({ id: 'i', severity: 'info' })]).next).toBeNull();
  });

  it('en móvil primero decisiones y alertas, sin perder tarjetas', () => {
    expect(MOBILE_ORDER.slice(0, 2)).toEqual(['priorities', 'teams']);
    expect([...MOBILE_ORDER].sort()).toEqual(
      ['community', 'users', 'offers', 'teams', 'revenue', 'payouts', 'capacity', 'goals', 'season', 'priorities'].sort(),
    );
  });

  it('la franja de decisión se monta en el dashboard existente (no otro dashboard)', () => {
    const client = read('app/admin/owner/OwnerDashboardClient.tsx');
    expect(client).toMatch(/<DecisionStrip/);
    expect(client).toMatch(/className="ceo-mosaic|'ceo-mosaic'/);
  });
});

describe('Founder OS · explicación humana de módulos', () => {
  it('cada módulo principal del menú tiene ficha', () => {
    const primary = OWNER_NAV_SECTIONS.filter((s) => s.id !== 'control').flatMap((s) => s.items.map((i) => i.href));
    for (const href of primary) expect(findFounderModule(href)?.href, href).toBe(href);
  });

  it('cada ficha cumple el formato y no expone nombres técnicos fuera de detalles', () => {
    for (const m of FOUNDER_MODULES) {
      expect(pageExists(m.href), m.href).toBe(true);
      expect(m.whatIs.length, m.name).toBeGreaterThanOrEqual(10);
      const human = [m.name, ...m.whatIs, m.whyExists, m.protects, m.measures, m.howToRead, m.owner].join(' ');
      expect(human, m.name).not.toMatch(/\b[a-z]+_[a-z_]+\b|\/api\/|\bsupabase\b|\(\)/i);
      expect(m.technical.length).toBeGreaterThan(0);
    }
  });

  it('solo moderación hereda subpáginas', () => {
    expect(findFounderModule('/admin/moderation/reports')?.href).toBe('/admin/moderation');
    expect(findFounderModule('/admin/operaciones/trabajo')).toBeNull();
    expect(findFounderModule('/admin/owner')).toBeNull();
  });

  it('el estado se deriva de las señales del Control Center', () => {
    const mod = FOUNDER_MODULES.find((m) => m.href === '/admin/moderation')!;
    const h = [health({ id: 'CATALOG', level: 'HEALTHY', updatedAt: '2026-10-04T10:00:00Z' })];
    expect(moduleStatus(mod, h, [])).toMatchObject({ label: 'Healthy', updatedAt: '2026-10-04T10:00:00Z', attention: [] });
    const withHigh = moduleStatus(mod, h, [priority({ id: 'q', severity: 'high' }), priority({ id: 'f', severity: 'critical', team: 'finanzas' })]);
    expect(withHigh.label).toBe('Atención');
    expect(withHigh.attention.map((p) => p.id)).toEqual(['q']);
    expect(moduleStatus(mod, [health({ id: 'CATALOG', level: 'CRITICAL' })], []).label).toBe('Crítico');
    expect(moduleStatus(mod, [], []).label).toBe('Sin datos');
    const map = FOUNDER_MODULES.find((m) => m.href === '/admin/sistemas/mapa')!;
    expect(moduleStatus(map, h, []).label).toBe('Informativo');
  });

  it('la ficha se carga solo al abrirse y vive en el shell del owner', () => {
    const brief = read('app/admin/owner/components/ModuleBrief.tsx');
    expect(brief).toMatch(/load\.status === 'idle'/);
    expect(brief).toMatch(/Ver detalles técnicos/);
    expect(brief).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(read('app/admin/owner/components/OwnerShell.tsx')).toMatch(/findFounderModule\(pathname\)/);
  });
});

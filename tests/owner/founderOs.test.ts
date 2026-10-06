import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_COMMAND_ITEMS, OWNER_NAV_SECTIONS, OWNER_VISTA_NAV } from '@/lib/owner/navigation';
import { CEO_CARD_DRILLDOWN, TEAM_TOOL_HREF } from '@/app/admin/owner/command/drilldowns';
import { summarizeDecision } from '@/app/admin/owner/command/decision';
import { MOBILE_ORDER } from '@/app/admin/owner/command/ceo/mosaic';
import { FOUNDER_MODULES, findFounderModule } from '@/lib/founderOs/modules';
import { moduleStatus } from '@/lib/founderOs/moduleStatus';
import { ADMIN_MODERATION_TABS, resolveModerationTabId } from '@/lib/moderation/hubConfig';
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

  it('CEO / Operations / Technical, con el Control Center como primera entrada', () => {
    expect(OWNER_NAV_SECTIONS.map((s) => s.id)).toEqual(['ceo', 'operations', 'technical']);
    expect(OWNER_NAV_SECTIONS.map((s) => s.items.map((i) => i.label))).toEqual([
      ['Control Center', 'Moderation', 'Supply', 'Money', 'Users', 'Health'],
      ['Live Metrics', 'Growth', 'Rewards Ops', 'Operaciones', 'Bot y trabajo', 'Activity'],
      ['Infrastructure', 'Systems Map', 'Configuration', 'Technical', 'Roles y permisos'],
    ]);
    expect(OWNER_NAV_SECTIONS[0]!.items[0]!.href).toBe('/admin/owner');
  });

  it('cada sección responde una pregunta humana', () => {
    for (const s of OWNER_NAV_SECTIONS) expect(s.question).toMatch(/^¿.+\?$/);
  });

  it('los roles globales se llaman «Roles y permisos», nunca solo «Team»', () => {
    const team = allItems.find((i) => i.href === '/admin/team');
    expect(team?.label).toBe('Roles y permisos');
    expect(allItems.some((i) => i.label === 'Team')).toBe(false);
    expect(allItems.find((i) => i.href === '/equipo')?.label).toBe('Team Hub');
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

  it('el menú no lista las vistas del CEO ni Team OS', () => {
    for (const item of allItems) {
      expect(item.href.startsWith('/admin/owner/vista')).toBe(false);
      expect(item.href === '/team' || item.href.startsWith('/team/')).toBe(false);
    }
  });

  it('el buscador cubre exactamente lo navegable', () => {
    expect(OWNER_COMMAND_ITEMS.map((i) => i.href).sort()).toEqual(allItems.map((i) => i.href).sort());
  });

  it('Baneos es una pestaña de Moderation (misma página, mismo shell)', () => {
    const bans = ADMIN_MODERATION_TABS.find((t) => t.id === 'bans');
    expect(bans).toMatchObject({ href: '/admin/moderation/bans', label: 'Baneos' });
    expect(pageExists(bans!.href)).toBe(true);
    expect(resolveModerationTabId('/admin/moderation/bans', 'admin')).toBe('bans');
    expect(resolveModerationTabId('/admin/moderation/reports', 'admin')).toBe('reports');
    expect(read('app/admin/moderation/ModerationHubShell.tsx')).not.toMatch(/moderation\/bans/);
    expect(new Set(ADMIN_MODERATION_TABS.map((t) => t.href)).size).toBe(ADMIN_MODERATION_TABS.length);
  });

  it('Supply · Hunter ya no se titula como el Control Center', () => {
    expect(read('app/admin/hunter/page.tsx')).not.toMatch(/CEO Control Center/);
  });
});

describe('Founder OS · menú CEO Dashboard', () => {
  it('es el menú principal, con las secciones del CEO Dashboard en su orden', () => {
    expect(OWNER_VISTA_NAV.map((i) => i.label)).toEqual([
      'Vista general',
      'Ingresos estimados',
      'Actividad de la comunidad',
      'Usuarios en tiempo real',
      'Ofertas publicadas',
      'Equipo de moderación',
      'Pagos pendientes',
      'Capacidad de Aventa',
      'Siguiente temporada',
      'Metas del día',
      'Prioridades del CEO',
    ]);
    expect(OWNER_VISTA_NAV[0]).toMatchObject({ href: '/admin/owner', exact: true });
  });

  it('cada entrada abre una herramienta real, sin repetir destino', () => {
    for (const item of OWNER_VISTA_NAV) {
      expect(pageExists(item.href), item.href).toBe(true);
      expect(item.href.startsWith('/admin/owner/vista')).toBe(false);
    }
    const hrefs = OWNER_VISTA_NAV.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('las tarjetas del Control Center y su entrada del menú llevan al mismo lugar', () => {
    const byLabel = Object.fromEntries(OWNER_VISTA_NAV.map((i) => [i.label, i.href]));
    expect(byLabel['Ingresos estimados']).toBe(CEO_CARD_DRILLDOWN.revenue);
    expect(byLabel['Ofertas publicadas']).toBe(CEO_CARD_DRILLDOWN.offers);
    expect(byLabel['Pagos pendientes']).toBe(CEO_CARD_DRILLDOWN.payouts);
    expect(byLabel['Capacidad de Aventa']).toBe(CEO_CARD_DRILLDOWN.capacity);
    expect(byLabel['Siguiente temporada']).toBe(CEO_CARD_DRILLDOWN.seasonPrep);
    expect(byLabel['Metas del día']).toBe(CEO_CARD_DRILLDOWN.goals);
  });

  it('el resto de herramientas va debajo, plegado hasta que se hace clic', () => {
    const sidebar = read('app/admin/owner/components/OwnerSidebar.tsx');
    const vistaAt = sidebar.indexOf('OWNER_VISTA_NAV.map');
    const allAt = sidebar.indexOf('data-owner-nav-section="all-tools"');
    expect(vistaAt).toBeGreaterThan(-1);
    expect(allAt).toBeGreaterThan(vistaAt);
    expect(sidebar.indexOf('OWNER_NAV_SECTIONS.map')).toBeGreaterThan(allAt);
    const allTag = sidebar.slice(sidebar.lastIndexOf('<details', allAt), sidebar.indexOf('>', allAt));
    expect(allTag).not.toMatch(/\bopen\b/);
  });
});

describe('Founder OS · Control Center', () => {
  it('cada bloque del CEO abre su vista', () => {
    expect(CEO_CARD_DRILLDOWN.revenue).toBe('/admin/owner/vista/ingresos');
    expect(CEO_CARD_DRILLDOWN.community).toBe('/admin/owner/vista/comunidad');
    expect(CEO_CARD_DRILLDOWN.users).toBe('/admin/owner/vista/usuarios');
    expect(CEO_CARD_DRILLDOWN.offers).toBe('/admin/owner/vista/ofertas');
    expect(CEO_CARD_DRILLDOWN.payouts).toBe('/admin/owner/vista/pagos');
    expect(CEO_CARD_DRILLDOWN.capacity).toBe('/admin/owner/vista/capacidad');
    expect(CEO_CARD_DRILLDOWN.goals).toBe('/admin/owner/vista/metas');
    expect(CEO_CARD_DRILLDOWN.seasonPrep).toBe('/admin/owner/vista/temporada');
    expect(CEO_CARD_DRILLDOWN.priorities).toBe('/admin/owner/vista/prioridades');
    for (const href of Object.values(CEO_CARD_DRILLDOWN)) {
      expect(pageExists(href), href).toBe(true);
    }
    for (const href of Object.values(TEAM_TOOL_HREF)) {
      expect(href.startsWith('/admin/owner/vista/equipos/')).toBe(true);
    }
    expect(existsSync(join(root, 'app/admin/owner/vista/equipos/[team]/page.tsx'))).toBe(true);
    const dir = join(root, 'app/admin/owner/command/ceo');
    const linked = readdirSync(dir)
      .filter((n) => n.endsWith('Card.tsx'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(linked).toMatch(/CEO_CARD_DRILLDOWN|team\.href/);
  });

  it('cada drill-down apunta a una vista que existe', () => {
    for (const href of Object.values(CEO_CARD_DRILLDOWN)) {
      expect(pageExists(href), href).toBe(true);
    }
    expect(existsSync(join(root, 'app/admin/owner/vista/equipos/[team]/page.tsx'))).toBe(true);
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
  it('cada módulo principal del menú tiene ficha con su mismo nombre', () => {
    const primary = OWNER_NAV_SECTIONS.flatMap((s) => s.items).filter((i) => i.href !== '/admin/owner');
    for (const item of primary) {
      const m = findFounderModule(item.href);
      expect(m?.href, item.href).toBe(item.href);
      expect(m?.name, item.href).toBe(item.label);
    }
  });

  it('cada ficha cumple el formato y no expone nombres técnicos fuera de detalles', () => {
    for (const m of FOUNDER_MODULES) {
      expect(pageExists(m.href), m.href).toBe(true);
      expect(m.whatIs.length, m.name).toBeGreaterThanOrEqual(10);
      for (const f of [m.decides, m.doesNotControl, m.whenToEnter]) expect(f.trim().length, m.name).toBeGreaterThan(10);
      const human = [m.name, ...m.whatIs, m.whyExists, m.protects, m.measures, m.howToRead, m.decides, m.doesNotControl, m.whenToEnter, m.owner].join(' ');
      expect(human, m.name).not.toMatch(/\b[a-z]+_[a-z_]+\b|\/api\/|\bsupabase\b|\(\)/i);
      expect(m.technical.length).toBeGreaterThan(0);
    }
  });

  it('solo moderación hereda subpáginas', () => {
    expect(findFounderModule('/admin/moderation/reports')?.href).toBe('/admin/moderation');
    expect(findFounderModule('/admin/operaciones/trabajo')?.name).toBe('Bot y trabajo');
    expect(findFounderModule('/admin/operaciones/otra')).toBeNull();
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

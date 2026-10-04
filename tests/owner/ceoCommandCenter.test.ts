import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bucketIndex, parseOwnerRange, pctChange, resolveOwnerRange } from '@/lib/owner/ownerRange';
import { upcomingSeasons } from '@/app/admin/owner/command/seasons';
import { daysSinceYmd, derivePriorities, deriveHealth, deriveGoals } from '@/app/admin/owner/command/derive';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';

const NOW = new Date('2026-10-03T15:00:00.000Z'); // 09:00 MX

describe('ownerRange', () => {
  it('parsea rangos válidos y cae a today', () => {
    expect(parseOwnerRange('7d')).toBe('7d');
    expect(parseOwnerRange('month')).toBe('month');
    expect(parseOwnerRange('evil')).toBe('today');
    expect(parseOwnerRange(null)).toBe('today');
  });

  it('today compara contra ayer a la misma hora (MX)', () => {
    const r = resolveOwnerRange('today', NOW);
    expect(r.start).toBe('2026-10-03T06:00:00.000Z');
    expect(r.prevStart).toBe('2026-10-02T06:00:00.000Z');
    expect(r.prevEnd).toBe('2026-10-02T15:00:00.000Z');
    expect(r.bucket).toBe('hour');
    expect(r.bucketCount).toBe(9);
    expect(bucketIndex(r, '2026-10-03T06:30:00.000Z')).toBe(0);
    expect(bucketIndex(r, '2026-10-02T23:00:00.000Z')).toBe(-1);
  });

  it('7d y 30d usan ventanas anteriores de igual duración', () => {
    const r7 = resolveOwnerRange('7d', NOW);
    expect(new Date(r7.end).getTime() - new Date(r7.start).getTime()).toBe(7 * 86_400_000);
    expect(new Date(r7.prevEnd).getTime()).toBe(new Date(r7.start).getTime());
    const r30 = resolveOwnerRange('30d', NOW);
    expect(r30.bucket).toBe('day');
    expect(r30.bucketCount).toBeGreaterThanOrEqual(30);
  });

  it('month compara contra el mismo avance del mes anterior', () => {
    const r = resolveOwnerRange('month', NOW);
    expect(r.start).toBe('2026-10-01T06:00:00.000Z');
    expect(r.prevStart).toBe('2026-09-01T06:00:00.000Z');
    expect(new Date(r.prevEnd).getTime() - new Date(r.prevStart).getTime()).toBe(
      new Date(r.end).getTime() - new Date(r.start).getTime(),
    );
  });

  it('pctChange no inventa porcentajes sin base', () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 5)).toBeNull();
    expect(pctChange(15, 10)).toBe(50);
  });
});

describe('seasons', () => {
  it('lista temporadas reales del calendario existente', () => {
    const s = upcomingSeasons('2026-10-03');
    expect(s.map((x) => x.name)).toEqual(['Buen Fin', 'Black Friday → Cyber Monday', 'Navidad (regalos)']);
    expect(s[0].start).toBe('2026-11-13');
    expect(s[0].end).toBe('2026-11-17');
    expect(s[1].start).toBe('2026-11-27');
  });

  it('detecta temporada en curso', () => {
    const s = upcomingSeasons('2026-05-25');
    expect(s[0].active).toBe(true);
    expect(s[0].start).toBe('2026-05-23');
  });
});

function makeBase(overrides: Partial<OwnerDashboardPayload> = {}): OwnerDashboardPayload {
  const base = {
    liveDeals: 12,
    summary: { status: 'green', headline: 'ok', subline: '' },
    moderation: {
      pending: 25,
      pendingGt24h: 4,
      oldestPendingHours: 30,
      slaHoursTarget: 24,
      approvedToday: 3,
    },
    operations: { integrityOk: false, integrityFailedChecks: 2, writeQueuePending: 0, writeQueueFailed: 0 },
    affiliation: { amazonTagConfigured: true, mercadolibreTagConfigured: true, programsActive: 2, programsTotal: 2 },
    attribution: { attributionGap: 0, completenessPct: 100, status: 'healthy' },
    offerHealth: { tableAvailable: true, outOfStock: 0, priceChanged: 0, verifiedAvailable: 0, activeWithoutCheck: 0, lastScanNote: '' },
    circuitBottleneck: { id: 'none', severity: 'green', problem: '', impact: '', recommendedAction: '', href: '/admin/owner' },
    systemHealth: { overall: 'healthy', components: [], moneyPathFrozen: true, supplyWriteEnabled: false, supplyMode: 'off', generatedAt: '' },
    ...overrides,
  };
  return base as unknown as OwnerDashboardPayload;
}

describe('derive', () => {
  it('prioriza integridad crítica antes que SLA y respeta reglas deterministas', () => {
    const p = derivePriorities(makeBase(), null, '2026-10-03', NOW.getTime());
    expect(p[0].id).toBe('integrity');
    expect(p.map((x) => x.id)).toContain('pending_sla');
    expect(p.every((x) => x.href.startsWith('/'))).toBe(true);
  });

  it('MONETIZATION se muestra FROZEN cuando el money path está congelado', () => {
    const h = deriveHealth(makeBase(), null, '2026-10-03', NOW.getTime());
    const money = h.find((c) => c.id === 'MONETIZATION');
    expect(money?.level).toBe('FROZEN');
    expect(money?.summary).toMatch(/Frozen — Money path protegido/);
    expect(h.find((c) => c.id === 'GROWTH')?.level).toBe('UNKNOWN');
  });

  it('sin datos no hay goals inventados', () => {
    expect(deriveGoals(null, null, null)).toEqual([]);
  });

  it('Aventa Health expone las 6 áreas de negocio en orden, con razón, CTA y enlace interno', () => {
    const h = deriveHealth(makeBase(), null, '2026-10-03', NOW.getTime());
    expect(h.map((c) => c.id)).toEqual(['PRODUCT', 'COMMUNITY', 'CATALOG', 'HUNTER', 'GROWTH', 'MONETIZATION']);
    for (const c of h) {
      expect(c.summary.length, c.id).toBeGreaterThan(0);
      expect(c.cta.length, c.id).toBeGreaterThan(0);
      expect(c.href.startsWith('/'), c.id).toBe(true);
    }
  });

  it('las prioridades usan solo severidades válidas y traen motivo, impacto y acción', () => {
    const p = derivePriorities(makeBase(), null, '2026-10-03', NOW.getTime());
    expect(p.length).toBeGreaterThan(0);
    for (const x of p) {
      expect(['critical', 'high', 'medium', 'info']).toContain(x.severity);
      expect(['REAL', 'CALCULATED']).toContain(x.provenance);
      expect(x.reason.length, x.id).toBeGreaterThan(0);
      expect(x.impact.length, x.id).toBeGreaterThan(0);
      expect(x.action.length, x.id).toBeGreaterThan(0);
    }
  });

  it('sin condiciones reales no se inventan prioridades', () => {
    expect(derivePriorities(null, null, '2026-10-03', NOW.getTime())).toEqual([]);
  });

  it('cron de métricas atrasado genera prioridad CALCULATED', () => {
    const cmd = {
      operations: { integrityFinishedAt: NOW.toISOString(), dailyMetricsLastDate: '2026-09-28', queueFailed: 0 },
      moderation: { pendingReports: 0 },
      hunter: { lastRunAt: NOW.toISOString(), errors: 0 },
      plaza: { pendingRequests: 0 },
      sources: { hunter: 'ok' },
      range: { label: 'Hoy' },
    } as unknown as OwnerCommandPayload;
    const p = derivePriorities(null, cmd, '2026-10-03', NOW.getTime());
    expect(p.find((x) => x.id === 'daily_metrics_stale')?.provenance).toBe('CALCULATED');
    expect(daysSinceYmd('2026-10-01', '2026-10-03')).toBe(2);
  });
});

describe('CEO Command Center security contracts', () => {
  it('la vista command sigue detrás de requireOwner', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/admin/owner-dashboard/route.ts'), 'utf8');
    expect(route).toMatch(/requireOwner\(request\)/);
    expect(route.indexOf('requireOwner(request)')).toBeLessThan(route.indexOf('buildOwnerCommand('));
  });

  it('los componentes cliente no importan el cliente service_role', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const root = join(process.cwd(), 'app/admin/owner');
    const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.some((f) => f.includes(join('command', 'ceo')))).toBe(true);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/lib\/supabase\/server['"]/);
      expect(src, f).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it('el builder del command center es de solo lectura', () => {
    const src = readFileSync(join(process.cwd(), 'lib/owner/buildOwnerCommand.ts'), 'utf8');
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
  });

  it('el dashboard no inventa presencia en vivo ni montos de payouts', () => {
    const dir = join(process.cwd(), 'app/admin/owner/command/ceo');
    const users = readFileSync(join(dir, 'UsersCard.tsx'), 'utf8');
    expect(users).not.toMatch(/En línea/);
    expect(users).toMatch(/No en vivo/);
    expect(users).toMatch(/no registra presencia en tiempo real/);
    const mods = readFileSync(join(dir, 'ModerationCard.tsx'), 'utf8');
    expect(mods).toMatch(/Sin presencia/);
    const payouts = readFileSync(join(dir, 'PayoutsCard.tsx'), 'utf8');
    expect(payouts).not.toMatch(/formatMoneyCents/);
    expect(payouts).not.toMatch(/fetch\(|method:\s*'POST'/);
  });

  it('las señales del CEO no muestran tablas ni columnas; eso vive solo en el diagnóstico técnico', () => {
    const cmdDir = join(process.cwd(), 'app/admin/owner/command');
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = walk(cmdDir).filter((f) => f.endsWith('.tsx') && !f.endsWith('TechnicalDiagnostics.tsx'));
    files.push(join(cmdDir, 'derive.ts'));
    const technical = /\b(moderation_logs|user_activity|offer_events|offer_reports|payout_intents|creator_rewards|user_roles|hunter_supply_runs|write_jobs_queue|daily_system_metrics|created_at|last_seen_at|MONEY_PATH_FROZEN)\b/;
    for (const f of files) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(technical);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CEO Control Center contracts', () => {
  const client = readFileSync(
    join(process.cwd(), 'app/admin/owner/OwnerDashboardClient.tsx'),
    'utf8',
  );
  const revenue = readFileSync(
    join(process.cwd(), 'app/admin/owner/components/RevenueSection.tsx'),
    'utf8',
  );
  const kpi = readFileSync(
    join(process.cwd(), 'app/admin/owner/components/OwnerKpiStrip.tsx'),
    'utf8',
  );
  const ceo = readFileSync(
    join(process.cwd(), 'app/admin/owner/components/CeoControlCenter.tsx'),
    'utf8',
  );
  const biz = readFileSync(
    join(process.cwd(), 'app/admin/owner/components/BusinessPerformance.tsx'),
    'utf8',
  );

  it('monta CeoControlCenter en owner dashboard', () => {
    expect(client).toMatch(/CeoControlCenter/);
  });

  it('nunca presenta estimatedCents como único "Revenue"', () => {
    expect(revenue).toMatch(/Revenue confirmed/);
    expect(revenue).toMatch(/Estimated opportunity/);
    expect(revenue).not.toMatch(/formatMoneyCents\(rows\.estimatedCents \?\? rows\.realCents\)/);
    expect(kpi).toMatch(/Revenue confirmed/);
    expect(kpi).not.toMatch(/estimatedCents/);
    expect(biz).toMatch(/Revenue confirmed/);
    expect(biz).toMatch(/Est\. opportunity/);
  });

  it('CEO surface separa confirmed / estimated / liability', () => {
    expect(ceo).toMatch(/Revenue confirmed/);
    expect(ceo).toMatch(/Revenue estimated/);
    expect(ceo).toMatch(/User liability/);
    expect(ceo).toMatch(/Live deals/);
    expect(ceo).toMatch(/Needs review/);
    expect(ceo).toMatch(/Pending → Live/);
    expect(ceo).toMatch(/Median decision/);
    expect(ceo).toMatch(/NO_DATA/);
  });

  it('CEO Moderation panel expone throughput y drain', () => {
    expect(ceo).toMatch(/data-ceo-moderation/);
    expect(ceo).toMatch(/SLA breach/);
    expect(ceo).toMatch(/High value/);
    expect(ceo).toMatch(/Throughput/);
    expect(ceo).toMatch(/ETA drain/);
    expect(ceo).toMatch(/formatHoursToDrain/);
    const builder = readFileSync(
      join(process.cwd(), 'lib/owner/buildOwnerDashboard.ts'),
      'utf8',
    );
    expect(builder).toMatch(/buildModerationOpsStats/);
    expect(builder).toMatch(/hoursToDrain/);
    expect(builder).toMatch(/slaBreachEstimate/);
  });

  it('CEO expone bottleneck STATUS→PROBLEM→IMPACT→ACTION', () => {
    expect(ceo).toMatch(/data-circuit-bottleneck/);
    expect(ceo).toMatch(/Bottleneck/);
    expect(ceo).toMatch(/Impacto:/);
    expect(ceo).toMatch(/Acción:/);
    expect(ceo).toMatch(/Outbound 7d/);
    const builder = readFileSync(
      join(process.cwd(), 'lib/owner/buildOwnerDashboard.ts'),
      'utf8',
    );
    expect(builder).toMatch(/circuitBottleneck/);
    expect(builder).toMatch(/pickCircuitBottleneck/);
    expect(builder).toMatch(/pendingGt24h/);
    expect(builder).toMatch(/live_starvation/);
  });

  it('rutas legacy de money siguen alcanzables en nav', () => {
    const nav = readFileSync(join(process.cwd(), 'lib/owner/navigation.ts'), 'utf8');
    expect(nav).toMatch(/\/admin\/commissions/);
    expect(nav).toMatch(/\/admin\/moderation/);
    expect(nav).toMatch(/\/admin\/hunter/);
    expect(nav).toMatch(/\/admin\/health/);
    expect(nav).toMatch(/audience: 'CEO'/);
    expect(nav).toMatch(/audience: 'TECHNICAL'/);
  });
});

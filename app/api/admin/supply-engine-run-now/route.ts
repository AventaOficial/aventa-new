import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  parseSupplyEngineMode,
  runSupplyEngine,
  summarizeSupplyEngineReport,
  enabledNicheProfiles,
} from '@/lib/hunter/supply';

export const maxDuration = 300;

/**
 * Owner/admin: ejecuta Supply Engine en caliente.
 * Body: { mode?, nicheId?, wave?, allowWrite? }
 * Default mode shadow — no inserts.
 */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      nicheId?: string;
      wave?: number;
      allowWrite?: boolean;
      persistSnapshots?: boolean;
    };

    const mode = parseSupplyEngineMode(body.mode ?? process.env.SUPPLY_ENGINE_MODE);
    const report = await runSupplyEngine({
      mode,
      nicheId: body.nicheId ?? null,
      wave: typeof body.wave === 'number' ? body.wave : null,
      allowWrite: body.allowWrite === true,
      persistSnapshots: body.persistSnapshots,
    });

    console.info('[supply-engine:run-now]', JSON.stringify(summarizeSupplyEngineReport(report)));

    return NextResponse.json(
      {
        ...summarizeSupplyEngineReport(report),
        niches: enabledNicheProfiles().map((p) => ({
          id: p.id,
          name: p.name,
          lane: p.lane,
          priority: p.priority,
        })),
        sampleCandidates: report.candidates.slice(0, 12).map((c) => ({
          url: c.canonicalUrl,
          title: c.title,
          dealScore: c.deal.dealScore,
          priceClass: c.deal.priceClass,
          laneHint: c.deal.laneHint,
          priority: c.moderationPriority,
          qualification: c.qualification,
        })),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

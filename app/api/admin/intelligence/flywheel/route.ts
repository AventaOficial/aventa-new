import { NextResponse } from 'next/server';
import { requireMetrics } from '@/lib/server/requireAdmin';
import { FLYWHEEL_LINKS, flywheelBreaks } from '@/lib/intelligence/flywheel/contracts';
import { snapshotIntelligenceTelemetry } from '@/lib/intelligence/telemetry';

export async function GET(request: Request) {
  const auth = await requireMetrics(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({
    links: FLYWHEEL_LINKS,
    breaks: flywheelBreaks().map((link) => `${link.from} → ${link.to}`),
    telemetry: snapshotIntelligenceTelemetry(),
    personalizedRanking: false,
    moneyMovement: false,
  });
}

import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { runIngestCycleForProfile } from '@/lib/bots/ingest/runIngestCycle';

export const maxDuration = 300;

/** Ejecuta el bot en caliente (owner/admin), sin esperar al cron. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => ({}));
    const profile = body?.profile === 'mega' ? 'mega' : 'standard';
    const report = await runIngestCycleForProfile(profile);
    console.info(
      '[bot-ingest:run-now]',
      JSON.stringify({
        runMode: report.runMode,
        pausedByOwner: report.pausedByOwner ?? false,
        enabled: report.enabled,
        inserted: report.summary.inserted,
        skipped: report.summary.skipped,
        rejected: report.summary.rejected,
        stageCounts: report.summary.stageCounts,
        skipReasonCounts: report.summary.skipReasonCounts ?? null,
        mlCollected: report.summary.sourceStats?.ml_api?.collected ?? 0,
      })
    );
    return NextResponse.json(report, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

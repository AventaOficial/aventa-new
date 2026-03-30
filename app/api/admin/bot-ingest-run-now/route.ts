import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { runIngestCycle } from '@/lib/bots/ingest';

/** Ejecuta el bot en caliente (owner/admin), sin esperar al cron. */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const report = await runIngestCycle();
    return NextResponse.json(report, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

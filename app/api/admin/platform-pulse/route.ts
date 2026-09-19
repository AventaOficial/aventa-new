import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  collectPlatformPulse,
  sanitizePlatformPulsePayload,
} from '@/lib/observability';

/**
 * GET — system-wide operational pulse (read-only counters).
 * Owner/admin only. Never returns secrets or env values.
 */
export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const windowRaw = url.searchParams.get('windowHours');
    const parsed = windowRaw ? Number(windowRaw) : undefined;
    const windowHours = Number.isFinite(parsed) ? parsed : undefined;

    const pulse = await collectPlatformPulse({ windowHours });
    const body = sanitizePlatformPulsePayload({
      ok: true,
      pulse,
      actorRole: auth.role,
    });

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'platform_pulse_failed';
    console.error('[platform-pulse] GET', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

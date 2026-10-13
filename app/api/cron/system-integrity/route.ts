import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { persistSystemIntegrityResult, runSystemIntegrityChecks } from '@/lib/server/systemIntegrity';
import { createServerClient } from '@/lib/supabase/server';
import { releaseStaleModerationLocks } from '@/lib/moderation/releaseStaleLocks';

const ALERT_TIMEOUT_MS = 5_000;

/** Devuelve `canal:resultado` sin URL ni credenciales. */
async function deliverAlert(
  channel: 'webhook' | 'email',
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<string> {
  try {
    const res = await fetch(url, { method: 'POST', ...init, signal: AbortSignal.timeout(ALERT_TIMEOUT_MS) });
    if (res.ok) return `${channel}:sent`;
    console.error(`[SYSTEM INTEGRITY] ${channel} alert rejected: HTTP ${res.status}`);
    return `${channel}:http_${res.status}`;
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error(`[SYSTEM INTEGRITY] ${channel} alert failed: ${timedOut ? 'timeout' : 'network_error'}`);
    return `${channel}:${timedOut ? 'timeout' : 'network_error'}`;
  }
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  // Piggyback: liberar claims abandonados (no consume un cron extra en Hobby).
  let staleLocksReleased = 0;
  try {
    const released = await releaseStaleModerationLocks(createServerClient(), { limit: 200 });
    staleLocksReleased = released.released;
  } catch (err) {
    console.error('[SYSTEM INTEGRITY] stale lock release failed', err);
  }

  const payload = await runSystemIntegrityChecks();
  await persistSystemIntegrityResult(payload);

  const failed = payload.checks.filter((c) => !c.ok);

  if (failed.length > 0) {
    console.error('[SYSTEM INTEGRITY] failed checks', failed);
    const webhookUrl = process.env.SYSTEM_ALERT_WEBHOOK_URL;
    const alertEmailTo = process.env.SYSTEM_ALERT_EMAIL_TO;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';
    const details = failed
      .map((f) => `- [${f.severity ?? 'n/a'}] ${f.name}: ${f.evidence}${f.action ? ` → ${f.action}` : ''}`)
      .join('\n');
    const text = `SYSTEM INTEGRITY FAILED\n${details}\n\nstartedAt=${payload.startedAt}\nfinishedAt=${payload.finishedAt}`;

    // Sin await la función serverless puede congelarse antes de que salga la alerta.
    // Un intento por canal, con timeout: el siguiente cron vuelve a avisar si sigue fallando.
    const deliveries: Array<Promise<string>> = [];
    if (webhookUrl) {
      deliveries.push(
        deliverAlert('webhook', webhookUrl, {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `AVENTA alerta de integridad:\n${text}`,
            failedChecks: failed,
            payload,
          }),
        }),
      );
    }

    if (alertEmailTo && resendKey) {
      deliveries.push(
        deliverAlert('email', 'https://api.resend.com/emails', {
          headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: alertEmailTo,
            subject: '[AVENTA] Alerta de integridad del sistema',
            text,
          }),
        }),
      );
    }
    const alerts = deliveries.length > 0 ? await Promise.all(deliveries) : ['none_configured'];
    return NextResponse.json({ ...payload, staleLocksReleased, alerts }, { status: 500 });
  }
  return NextResponse.json({ ...payload, staleLocksReleased }, { status: 200 });
}

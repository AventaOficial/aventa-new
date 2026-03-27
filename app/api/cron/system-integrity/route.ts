import { NextRequest, NextResponse } from 'next/server';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { persistSystemIntegrityResult, runSystemIntegrityChecks } from '@/lib/server/systemIntegrity';

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const payload = await runSystemIntegrityChecks();
  await persistSystemIntegrityResult(payload);

  const failed = payload.checks.filter((c) => !c.ok);

  if (failed.length > 0) {
    console.error('[SYSTEM INTEGRITY] failed checks', failed);
    const webhookUrl = process.env.SYSTEM_ALERT_WEBHOOK_URL;
    const alertEmailTo = process.env.SYSTEM_ALERT_EMAIL_TO;
    const resendKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';
    const details = failed.map((f) => `- ${f.name}: ${f.detail}`).join('\n');
    const text = `SYSTEM INTEGRITY FAILED\n${details}\n\nstartedAt=${payload.startedAt}\nfinishedAt=${payload.finishedAt}`;

    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `AVENTA alerta de integridad:\n${text}`,
          failedChecks: failed,
          payload,
        }),
      }).catch((err) => console.error('[SYSTEM INTEGRITY] webhook alert failed', err));
    }

    if (alertEmailTo && resendKey) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: alertEmailTo,
          subject: '[AVENTA] Alerta de integridad del sistema',
          text,
        }),
      }).catch((err) => console.error('[SYSTEM INTEGRITY] email alert failed', err));
    }
    return NextResponse.json(payload, { status: 500 });
  }
  return NextResponse.json(payload, { status: 200 });
}

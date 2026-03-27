import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/server/requireAdmin';
import { getWriteQueueBacklog } from '@/lib/server/writeQueue';

type SignalStatus = 'green' | 'yellow' | 'red';

function getSignalStatus(ok: boolean, warn: boolean): SignalStatus {
  if (ok) return 'green';
  if (warn) return 'yellow';
  return 'red';
}

export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();

  const [integrityRes, queueBacklog] = await Promise.all([
    supabase.from('app_config').select('value').eq('key', 'system_integrity_last').maybeSingle(),
    getWriteQueueBacklog(),
  ]);

  const integrity = (integrityRes.data as { value?: { ok?: boolean; summary?: { failed?: number } } } | null)?.value;
  const integrityOk = Boolean(integrity?.ok);
  const integrityFailed = integrity?.summary?.failed ?? 0;

  const emailConfigured = Boolean(process.env.SYSTEM_ALERT_EMAIL_TO?.trim());
  const webhookConfigured = Boolean(process.env.SYSTEM_ALERT_WEBHOOK_URL?.trim());
  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const alertingOk = (emailConfigured && resendConfigured) || webhookConfigured;

  const pending = queueBacklog.pending;
  const failed = queueBacklog.failed;
  const queueStatus = pending === 0 && failed === 0 ? 'green' : pending <= 200 && failed <= 20 ? 'yellow' : 'red';

  // Growth signal (7d vs 7d previo)
  let growthWeeklyPct: number | null = null;
  try {
    const now = Date.now();
    const seven = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteen = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [currentRes, previousRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', seven),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', fourteen).lt('created_at', seven),
    ]);
    const current = currentRes.count ?? 0;
    const previous = previousRes.count ?? 0;
    growthWeeklyPct = Math.round((((current - previous) / Math.max(previous, 1)) * 100) * 100) / 100;
  } catch {
    growthWeeklyPct = null;
  }

  const growthStatus = growthWeeklyPct == null ? 'yellow' : growthWeeklyPct >= 0 ? 'green' : 'yellow';

  const overallStatus = integrityOk && alertingOk && queueStatus === 'green'
    ? 'green'
    : integrityOk && queueStatus !== 'red'
    ? 'yellow'
    : 'red';

  return NextResponse.json({
    overall: overallStatus,
    signals: {
      integrity: {
        status: getSignalStatus(integrityOk, integrityFailed <= 2 && integrityFailed > 0),
        failed_checks: integrityFailed,
      },
      alerting: {
        status: getSignalStatus(alertingOk, !alertingOk),
        emailConfigured,
        webhookConfigured,
        resendConfigured,
      },
      queue: {
        status: queueStatus,
        pending,
        failed,
      },
      growth: {
        status: growthStatus,
        weekly_pct: growthWeeklyPct,
      },
    },
  });
}


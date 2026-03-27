import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/server/requireAdmin';

/**
 * Estado operativo para el panel del dueño: qué variables están configuradas (solo booleanos, sin valores).
 */
export async function GET(request: Request) {
  const auth = await requireOwner(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const emailTo = process.env.SYSTEM_ALERT_EMAIL_TO?.trim();
  const webhook = process.env.SYSTEM_ALERT_WEBHOOK_URL?.trim();
  const resend = process.env.RESEND_API_KEY?.trim();

  return NextResponse.json({
    alerts: {
      emailToConfigured: Boolean(emailTo),
      webhookConfigured: Boolean(webhook),
      /** Sin Resend, el correo de alerta no puede enviarse aunque haya destinatario. */
      resendConfigured: Boolean(resend),
    },
    deploy: {
      vercel: Boolean(process.env.VERCEL),
      nodeEnv: process.env.NODE_ENV ?? 'development',
    },
  });
}

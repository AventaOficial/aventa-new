import { buildOfferPublicPath } from '@/lib/offerPath';
import {
  buildCommentApprovedNotificationHtml,
  buildOfferPublishedNotificationHtml,
  truncatePlainTextForEmail,
} from '@/lib/email/templates';

const RESEND_URL = 'https://api.resend.com/emails';

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://aventaofertas.com').replace(/\/$/, '');
}

export async function sendTransactionalHtml(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key || !to?.trim()) return false;
  const from = process.env.EMAIL_FROM || 'AVENTA <onboarding@resend.dev>';
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to.trim()], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendOfferApprovedUserEmail(to: string, offerTitle: string, offerId: string): Promise<void> {
  const root = baseUrl();
  const link = `${root}${buildOfferPublicPath(offerId, offerTitle)}`;
  const html = buildOfferPublishedNotificationHtml({
    offerTitle,
    offerUrl: link,
    baseUrl: root,
  });
  const subject = `Tu oferta fue publicada: ${truncatePlainTextForEmail(offerTitle, 58)}`;
  await sendTransactionalHtml(to, subject, html);
}

export async function sendCommentApprovedUserEmail(
  to: string,
  offerTitle: string,
  offerId: string,
  excerpt: string
): Promise<void> {
  const root = baseUrl();
  const link = `${root}${buildOfferPublicPath(offerId, offerTitle)}`;
  const html = buildCommentApprovedNotificationHtml({
    offerTitle,
    offerUrl: link,
    excerpt,
    baseUrl: root,
  });
  await sendTransactionalHtml(to, 'Tu comentario ya está publicado en AVENTA', html);
}

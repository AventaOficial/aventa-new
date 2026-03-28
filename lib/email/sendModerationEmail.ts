import { buildOfferPublicPath } from '@/lib/offerPath';

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
  const link = `${baseUrl()}${buildOfferPublicPath(offerId, offerTitle)}`;
  const safeTitle = offerTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <p>Hola,</p>
    <p>Tu oferta <strong>${safeTitle}</strong> fue <strong>aprobada</strong> y ya es visible en AVENTA.</p>
    <p><a href="${link}">Ver tu oferta</a></p>
    <p style="color:#666;font-size:13px;margin-top:24px;">— El equipo AVENTA</p>
  `;
  await sendTransactionalHtml(to, `Tu oferta fue publicada: ${offerTitle.slice(0, 60)}`, html);
}

export async function sendCommentApprovedUserEmail(
  to: string,
  offerTitle: string,
  offerId: string,
  excerpt: string
): Promise<void> {
  const link = `${baseUrl()}${buildOfferPublicPath(offerId, offerTitle)}`;
  const safeOffer = offerTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeExcerpt = excerpt.slice(0, 200).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <p>Hola,</p>
    <p>Tu comentario en <strong>${safeOffer}</strong> fue <strong>aprobado</strong> y ya es visible.</p>
    <blockquote style="border-left:3px solid #7c3aed;padding-left:12px;color:#444;">${safeExcerpt}</blockquote>
    <p><a href="${link}">Ver la oferta</a></p>
    <p style="color:#666;font-size:13px;margin-top:24px;">— El equipo AVENTA</p>
  `;
  await sendTransactionalHtml(to, 'Tu comentario ya está publicado en AVENTA', html);
}

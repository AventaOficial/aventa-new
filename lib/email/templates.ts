/**
 * Plantilla base y builders HTML para correos (diario y semanal).
 * Estilos inline para compatibilidad con clientes de correo.
 */

const BRAND_COLOR = '#7c3aed';
const TEXT_DARK = '#1a1a1a';
const TEXT_MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const BG_LIGHT = '#f9fafb';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type EmailLayoutOptions = {
  title: string;
  preheader?: string;
  baseUrl: string;
  settingsPath?: string;
};

/**
 * Envuelve el contenido en layout común: cabecera AVENTA, contenido, CTA y pie.
 */
export function emailLayout(innerBody: string, opts: EmailLayoutOptions): string {
  const { title, preheader = '', baseUrl, settingsPath = '/settings' } = opts;
  const settingsUrl = baseUrl.replace(/\/$/, '') + settingsPath;
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)}</title>
  ${preheaderBlock}
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color:#f3f4f6; color:${TEXT_DARK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,0.08); overflow:hidden;">
          <!-- Cabecera -->
          <tr>
            <td style="padding:28px 24px 20px; text-align:center; border-bottom:1px solid ${BORDER};">
              <a href="${baseUrl}" style="text-decoration:none; font-size:22px; font-weight:700; color:${BRAND_COLOR}; letter-spacing:-0.02em;">AVENTA</a>
              <p style="margin:6px 0 0; font-size:13px; color:${TEXT_MUTED};">Las mejores ofertas, elegidas por la comunidad</p>
            </td>
          </tr>
          <!-- Contenido -->
          <tr>
            <td style="padding:24px;">
              ${innerBody}
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 24px 24px; text-align:center;">
              <a href="${baseUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px;">Ver todas las ofertas en AVENTA</a>
            </td>
          </tr>
          <!-- Pie -->
          <tr>
            <td style="padding:16px 24px; background:${BG_LIGHT}; border-top:1px solid ${BORDER}; font-size:12px; color:${TEXT_MUTED}; text-align:center;">
              <a href="${settingsUrl}" style="color:${BRAND_COLOR}; text-decoration:none;">Gestionar notificaciones y correos</a>
              <span style="margin:0 6px;">·</span>
              <a href="${baseUrl}" style="color:${BRAND_COLOR}; text-decoration:none;">aventaofertas.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

type OfferRow = {
  id: string;
  title: string;
  price?: number;
  original_price?: number | null;
  store?: string | null;
  offer_url?: string | null;
};

export function buildDailyHtml(offers: OfferRow[], baseUrl: string): string {
  const rows = offers
    .map((o, i) => {
      const price =
        o.price != null
          ? '$' +
              Number(o.price).toFixed(0) +
              (o.original_price
                ? ` <span style="color:${TEXT_MUTED}; text-decoration:line-through;">$${Number(o.original_price).toFixed(0)}</span>`
                : '')
          : '—';
      const link = baseUrl.replace(/\/$/, '') + '/?o=' + o.id;
      const title = escapeHtml(o.title || 'Sin título');
      const store = escapeHtml(o.store || '—');
      return `
        <tr>
          <td style="padding:12px 10px; border-bottom:1px solid ${BORDER}; font-size:14px; color:${TEXT_MUTED}; width:28px; vertical-align:top;">${i + 1}.</td>
          <td style="padding:12px 10px; border-bottom:1px solid ${BORDER};">
            <a href="${link}" style="color:${BRAND_COLOR}; text-decoration:none; font-weight:500;">${title}</a>
            <div style="font-size:13px; color:${TEXT_MUTED}; margin-top:2px;">${store}</div>
          </td>
          <td style="padding:12px 10px; border-bottom:1px solid ${BORDER}; font-size:14px; font-weight:600; color:${TEXT_DARK}; white-space:nowrap;">${price}</td>
        </tr>`;
    })
    .join('');

  const inner = `
    <h1 style="margin:0 0 20px; font-size:20px; font-weight:700; color:${TEXT_DARK};">Top 10 ofertas del día</h1>
    <p style="margin:0 0 16px; font-size:14px; color:${TEXT_MUTED};">Las ofertas mejor valoradas por la comunidad hoy.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${rows || '<tr><td colspan="3" style="padding:16px; color:' + TEXT_MUTED + ';">No hay ofertas publicadas hoy.</td></tr>'}
    </table>`;

  return emailLayout(inner, {
    title: 'Top 10 del día — AVENTA',
    preheader: 'Las 10 mejores ofertas del día en AVENTA.',
    baseUrl,
  });
}

export function buildWeeklyHtml(
  topCommented: { id: string; title: string; price?: number; store?: string | null }[],
  topVoted: { id: string; title: string; price?: number; store?: string | null }[],
  baseUrl: string
): string {
  const offerLi = (o: { id: string; title: string; store?: string | null }) => {
    const link = baseUrl.replace(/\/$/, '') + '/?o=' + o.id;
    return `<li style="margin-bottom:10px;"><a href="${link}" style="color:${BRAND_COLOR}; text-decoration:none; font-weight:500;">${escapeHtml(o.title)}</a>${o.store ? ` <span style="color:${TEXT_MUTED}; font-size:13px;">— ${escapeHtml(o.store)}</span>` : ''}</li>`;
  };

  const commentedList =
    topCommented.length > 0
      ? topCommented.map(offerLi).join('')
      : '<li style="color:' + TEXT_MUTED + ';">No hay datos esta semana.</li>';
  const votedList =
    topVoted.length > 0
      ? topVoted.map(offerLi).join('')
      : '<li style="color:' + TEXT_MUTED + ';">No hay datos esta semana.</li>';

  const inner = `
    <h1 style="margin:0 0 20px; font-size:20px; font-weight:700; color:${TEXT_DARK};">Resumen de la semana</h1>
    <p style="margin:0 0 20px; font-size:14px; color:${TEXT_MUTED};">Lo más comentado y mejor votado en los últimos 7 días.</p>

    <h2 style="margin:0 0 10px; font-size:15px; font-weight:600; color:${TEXT_DARK};">Más comentadas (3)</h2>
    <ul style="list-style:none; padding:0; margin:0 0 24px;">${commentedList}</ul>

    <h2 style="margin:0 0 10px; font-size:15px; font-weight:600; color:${TEXT_DARK};">Mejor votadas (5)</h2>
    <ul style="list-style:none; padding:0; margin:0;">${votedList}</ul>`;

  return emailLayout(inner, {
    title: 'Resumen semanal — AVENTA',
    preheader: 'Las ofertas más comentadas y mejor votadas de la semana.',
    baseUrl,
  });
}

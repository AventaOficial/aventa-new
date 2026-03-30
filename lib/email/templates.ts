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
  /** URL de la imagen del logo (ej. https://aventaofertas.com/logo-email.png). Si no se define, solo se muestra el texto AVENTA. */
  logoUrl?: string | null;
  /** Sustituye el botón violeta del pie (“Ver todas las ofertas…”) por un enlace concreto (p. ej. “Ver tu oferta”). */
  primaryFooterCta?: { href: string; label: string };
};

/**
 * Envuelve el contenido en layout común: cabecera AVENTA, contenido, CTA y pie.
 */
export function emailLayout(innerBody: string, opts: EmailLayoutOptions): string {
  const { title, preheader = '', baseUrl, settingsPath = '/settings', logoUrl: logoUrlOpt, primaryFooterCta } = opts;
  const logoUrl = logoUrlOpt ?? (typeof process !== 'undefined' && process.env?.EMAIL_LOGO_URL) ?? null;
  const settingsUrl = baseUrl.replace(/\/$/, '') + settingsPath;
  const logoImg =
    logoUrl && String(logoUrl).trim()
      ? `<a href="${baseUrl}" style="display:inline-block; margin-bottom:8px;"><img src="${escapeHtml(String(logoUrl).trim())}" alt="AVENTA" width="120" height="40" style="display:block; max-width:120px; height:auto; border:0;" /></a>`
      : '';
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:16px; box-shadow:0 1px 3px rgba(0,0,0,0.06); overflow:hidden;">
          <!-- Cabecera (logo + texto; logo opcional para que Gmail muestre identidad visual) -->
          <tr>
            <td style="padding:28px 24px 20px; text-align:center; border-bottom:1px solid ${BORDER};">
              ${logoImg}
              <a href="${baseUrl}" style="text-decoration:none; font-size:22px; font-weight:700; color:${TEXT_DARK}; letter-spacing:-0.03em;">AVENTA</a>
              <p style="margin:8px 0 0; font-size:13px; color:${TEXT_MUTED}; line-height:1.4;">Elegidas por la comunidad.</p>
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
              <a href="${primaryFooterCta ? escapeHtml(primaryFooterCta.href) : baseUrl}" style="display:inline-block; background:${BRAND_COLOR}; color:#ffffff; padding:14px 28px; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px;">${primaryFooterCta ? escapeHtml(primaryFooterCta.label) : 'Ver todas las ofertas en AVENTA'}</a>
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
  image_url?: string | null;
};

/** Tarjeta de oferta para email, estilo similar al OfferCard del home */
function offerCardHtml(o: OfferRow, index: number, baseUrl: string): string {
  const link = `${baseUrl.replace(/\/$/, '')}/oferta/${o.id}`;
  const title = escapeHtml(o.title || 'Sin título');
  const store = escapeHtml(o.store || '—');
  const price =
    o.price != null
      ? '$' +
        Number(o.price).toFixed(0) +
        (o.original_price
          ? ` <span style="color:${TEXT_MUTED}; text-decoration:line-through; font-weight:400;">$${Number(o.original_price).toFixed(0)}</span>`
          : '')
      : '—';
  const imgUrl = o.image_url && o.image_url.trim() ? o.image_url.trim() : null;
  const imgBlock = imgUrl
    ? `<a href="${link}" style="display:block; text-decoration:none;"><img src="${escapeHtml(imgUrl)}" alt="" width="100%" style="display:block; width:100%; height:120px; object-fit:cover; border-radius:8px 8px 0 0; border:0;" /></a>`
    : `<div style="height:80px; background:${BG_LIGHT}; border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center;"><span style="color:${TEXT_MUTED}; font-size:12px;">Oferta #${index + 1}</span></div>`;

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px; border:1px solid ${BORDER}; border-radius:10px; overflow:hidden; background:#fff;">
      <tr>
        <td style="vertical-align:top;">${imgBlock}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;">
          <a href="${link}" style="color:${TEXT_DARK}; text-decoration:none; font-weight:600; font-size:15px; line-height:1.3;">${title}</a>
          <div style="font-size:13px; color:${TEXT_MUTED}; margin-top:4px;">${store}</div>
          <div style="margin-top:8px;"><span style="font-size:16px; font-weight:700; color:${BRAND_COLOR};">${price}</span></div>
          <a href="${link}" style="display:inline-block; margin-top:10px; font-size:13px; color:${BRAND_COLOR}; font-weight:500; text-decoration:none;">Ver oferta →</a>
        </td>
      </tr>
    </table>`;
}

export function buildDailyHtml(
  offers: OfferRow[],
  baseUrl: string,
  yourOffersInTop?: { id: string; title: string }[],
  opts?: { title?: string; preheader?: string; dayLabel?: string }
): string {
  const cardsHtml =
    offers.length > 0
      ? offers.map((o, i) => offerCardHtml(o, i, baseUrl)).join('')
      : `<p style="margin:0; padding:16px 0; color:${TEXT_MUTED}; font-size:14px;">No hay ofertas publicadas en este día.</p>`;

  const yourBlock =
    yourOffersInTop && yourOffersInTop.length > 0
      ? `
    <div style="margin-bottom:20px; padding:14px 16px; background:${BRAND_COLOR}12; border-radius:10px; border-left:4px solid ${BRAND_COLOR};">
      <p style="margin:0 0 8px; font-size:14px; font-weight:600; color:${TEXT_DARK};">¡Tu oferta está en el ranking de hoy!</p>
      ${yourOffersInTop
        .map(
          (o) =>
            `<a href="${baseUrl.replace(/\/$/, '')}/oferta/${o.id}" style="color:${BRAND_COLOR}; font-weight:500; text-decoration:none;">${escapeHtml(o.title)}</a>`
        )
        .join('<br />')}
    </div>`
      : '';

  const eyebrow = `<p style="margin:0 0 8px; font-size:11px; font-weight:600; color:${TEXT_MUTED}; letter-spacing:0.07em; text-transform:uppercase;">${escapeHtml(opts?.title ?? 'Hoy en AVENTA')}</p>`;
  const headline = opts?.dayLabel
    ? `<h1 style="margin:0 0 14px; font-size:26px; font-weight:600; color:${TEXT_DARK}; letter-spacing:-0.03em; line-height:1.15;">${escapeHtml(opts.dayLabel)}</h1>`
    : `<h1 style="margin:0 0 14px; font-size:26px; font-weight:600; color:${TEXT_DARK}; letter-spacing:-0.03em;">${escapeHtml(opts?.title ?? 'Hoy en AVENTA')}</h1>`;

  const inner = `
    ${eyebrow}
    ${headline}
    <p style="margin:0 0 22px; font-size:15px; color:${TEXT_MUTED}; line-height:1.5;">Lo más apoyado del día, en orden de apoyo.</p>
    ${yourBlock}
    ${cardsHtml}
  `;

  return emailLayout(inner, {
    title: opts?.title ?? 'Hoy en AVENTA',
    preheader: opts?.preheader ?? 'Las ofertas del día con más apoyo.',
    baseUrl,
  });
}

export type WeeklyDayBlock = {
  dayLabel: string;
  offers: OfferRow[];
};

export function buildWeeklyHtml(
  dayBlocks: WeeklyDayBlock[],
  topCommented: { id: string; title: string; price?: number; store?: string | null }[],
  baseUrl: string,
  topHunters?: { display_name: string; slug?: string | null }[]
): string {
  const offerLi = (o: { id: string; title: string; store?: string | null }) => {
    const link = `${baseUrl.replace(/\/$/, '')}/oferta/${o.id}`;
    return `<li style="margin-bottom:10px;"><a href="${link}" style="color:${BRAND_COLOR}; text-decoration:none; font-weight:500;">${escapeHtml(o.title)}</a>${o.store ? ` <span style="color:${TEXT_MUTED}; font-size:13px;">— ${escapeHtml(o.store)}</span>` : ''}</li>`;
  };

  const commentedList =
    topCommented.length > 0
      ? topCommented.map(offerLi).join('')
      : '<li style="color:' + TEXT_MUTED + ';">No hay datos esta semana.</li>';

  const huntersBlock =
    topHunters && topHunters.length > 0
      ? `
    <h2 style="margin:0 0 6px; font-size:15px; font-weight:600; color:${TEXT_DARK};">Cazadores de la semana</h2>
    <p style="margin:0 0 14px; font-size:14px; color:${TEXT_MUTED}; line-height:1.45;">Quienes publicaron ofertas que más gustaron.</p>
    <ul style="list-style:none; padding:0; margin:0 0 24px;">
      ${topHunters
        .map(
          (h) =>
            `<li style="margin-bottom:6px;">${h.slug ? `<a href="${baseUrl.replace(/\/$/, '')}/u/${escapeHtml(h.slug)}" style="color:${BRAND_COLOR}; text-decoration:none; font-weight:500;">${escapeHtml(h.display_name)}</a>` : escapeHtml(h.display_name)}</li>`
        )
        .join('')}
    </ul>`
      : '';

  const daySectionsHtml = dayBlocks
    .map((block) => {
      const cards =
        block.offers.length > 0
          ? block.offers.map((o, i) => offerCardHtml(o as OfferRow, i, baseUrl)).join('')
          : `<p style="margin:0; font-size:13px; color:${TEXT_MUTED};">Sin ofertas este día.</p>`;
      return `
    <h2 style="margin:24px 0 12px; font-size:16px; font-weight:600; color:${TEXT_DARK}; border-bottom:1px solid ${BORDER}; padding-bottom:8px;">${escapeHtml(block.dayLabel)}</h2>
    <p style="margin:0 0 12px; font-size:13px; color:${TEXT_MUTED};">Hasta tres destacadas del día.</p>
    ${cards}`;
    })
    .join('');

  const inner = `
    <h1 style="margin:0 0 8px; font-size:22px; font-weight:600; color:${TEXT_DARK}; letter-spacing:-0.02em;">Tu semana en AVENTA</h1>
    <p style="margin:0 0 22px; font-size:15px; color:${TEXT_MUTED}; line-height:1.5;">Siete días en un vistazo: cada día, hasta tres ofertas con más apoyo. Al final, las que más conversación tuvieron.</p>
    ${huntersBlock}
    ${daySectionsHtml}

    <h2 style="margin:28px 0 10px; font-size:15px; font-weight:600; color:${TEXT_DARK};">Más comentadas</h2>
    <ul style="list-style:none; padding:0; margin:0;">${commentedList}</ul>`;

  return emailLayout(inner, {
    title: 'Tu semana · AVENTA',
    preheader: 'Destacadas por día y las que más comentaron.',
    baseUrl,
  });
}

/** Texto plano para asuntos y preheaders (sin HTML). */
export function truncatePlainTextForEmail(s: string, maxLen: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Misma estética que diario/semanal: layout AVENTA + tarjeta de detalle + CTA a la oferta. */
export function buildOfferPublishedNotificationHtml(opts: {
  offerTitle: string;
  offerUrl: string;
  baseUrl: string;
}): string {
  const titleShort = truncatePlainTextForEmail(opts.offerTitle, 160);
  const inner = `
    <p style="margin:0 0 10px; font-size:11px; font-weight:600; color:${TEXT_MUTED}; letter-spacing:0.08em; text-transform:uppercase;">Notificación</p>
    <h1 style="margin:0 0 12px; font-size:24px; font-weight:600; color:${TEXT_DARK}; letter-spacing:-0.03em; line-height:1.2;">Tu oferta ya está publicada</h1>
    <p style="margin:0 0 20px; font-size:15px; color:${TEXT_MUTED}; line-height:1.5;">La comunidad ya puede verla en el feed. Gracias por cazar y compartir.</p>
    <div style="padding:16px 18px; background:${BG_LIGHT}; border-radius:12px; border:1px solid ${BORDER}; border-left:4px solid ${BRAND_COLOR}; margin-bottom:20px;">
      <p style="margin:0; font-size:11px; font-weight:600; color:${TEXT_MUTED}; text-transform:uppercase; letter-spacing:0.06em;">Producto</p>
      <p style="margin:8px 0 0; font-size:16px; font-weight:600; color:${TEXT_DARK}; line-height:1.35;">${escapeHtml(titleShort)}</p>
    </div>
    <p style="margin:0; font-size:14px; color:${TEXT_MUTED}; line-height:1.5;">Puedes abrirla, compartirla o revisar comentarios cuando quieras.</p>
  `;
  return emailLayout(inner, {
    title: 'Tu oferta en AVENTA',
    preheader: truncatePlainTextForEmail(opts.offerTitle, 96),
    baseUrl: opts.baseUrl,
    primaryFooterCta: { href: opts.offerUrl, label: 'Ver tu oferta' },
  });
}

export function buildCommentApprovedNotificationHtml(opts: {
  offerTitle: string;
  offerUrl: string;
  excerpt: string;
  baseUrl: string;
}): string {
  const offerShort = truncatePlainTextForEmail(opts.offerTitle, 120);
  const excerptShort = truncatePlainTextForEmail(opts.excerpt, 240);
  const inner = `
    <p style="margin:0 0 10px; font-size:11px; font-weight:600; color:${TEXT_MUTED}; letter-spacing:0.08em; text-transform:uppercase;">Comentario aprobado</p>
    <h1 style="margin:0 0 12px; font-size:24px; font-weight:600; color:${TEXT_DARK}; letter-spacing:-0.03em; line-height:1.2;">Tu comentario ya es visible</h1>
    <p style="margin:0 0 18px; font-size:15px; color:${TEXT_MUTED}; line-height:1.5;">En la oferta:</p>
    <div style="padding:14px 16px; background:#fff; border:1px solid ${BORDER}; border-radius:10px; margin-bottom:16px;">
      <p style="margin:0; font-size:15px; font-weight:600; color:${TEXT_DARK}; line-height:1.35;">${escapeHtml(offerShort)}</p>
    </div>
    <div style="padding:14px 16px; background:${BG_LIGHT}; border-radius:10px; border-left:4px solid ${BRAND_COLOR}; margin-bottom:20px;">
      <p style="margin:0 0 8px; font-size:11px; font-weight:600; color:${TEXT_MUTED}; text-transform:uppercase; letter-spacing:0.05em;">Tu texto</p>
      <p style="margin:0; font-size:14px; color:#374151; line-height:1.45;">${escapeHtml(excerptShort)}</p>
    </div>
  `;
  return emailLayout(inner, {
    title: 'Comentario publicado · AVENTA',
    preheader: truncatePlainTextForEmail(excerptShort, 88),
    baseUrl: opts.baseUrl,
    primaryFooterCta: { href: opts.offerUrl, label: 'Ver la oferta' },
  });
}

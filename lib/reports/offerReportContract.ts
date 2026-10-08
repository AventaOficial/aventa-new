export const OFFER_REPORT_TYPES = [
  'precio_falso',
  'no_es_oferta',
  'expirada',
  'spam',
  'afiliado_oculto',
  'otro',
] as const;

export type OfferReportType = (typeof OFFER_REPORT_TYPES)[number];

export const OFFER_REPORT_MIN_USEFUL = 30;
export const OFFER_REPORT_MAX_CHARS = 500;

/** Política vigente del preset `reports`: 10 por minuto. La identidad es el usuario, no la IP. */
export const OFFER_REPORT_RATE_PER_MINUTE = 10;

export type OfferReportTextCode = 'REPORT_TEXT_TOO_SHORT' | 'REPORT_TEXT_TOO_LONG';

export function offerReportUsefulLength(raw: string): number {
  return raw.trim().replace(/\s+/g, '').length;
}

export function assessOfferReportText(raw: string):
  | { ok: true; comment: string; usefulLength: number }
  | { ok: false; code: OfferReportTextCode; usefulLength: number; message: string } {
  const comment = typeof raw === 'string' ? raw.trim() : '';
  const usefulLength = comment.replace(/\s+/g, '').length;
  if (comment.length > OFFER_REPORT_MAX_CHARS || usefulLength > OFFER_REPORT_MAX_CHARS) {
    return {
      ok: false,
      code: 'REPORT_TEXT_TOO_LONG',
      usefulLength,
      message: 'El reporte no puede pasar de 500 caracteres.',
    };
  }
  if (usefulLength < OFFER_REPORT_MIN_USEFUL) {
    return {
      ok: false,
      code: 'REPORT_TEXT_TOO_SHORT',
      usefulLength,
      message: 'Escribe al menos 30 caracteres.',
    };
  }
  return { ok: true, comment, usefulLength };
}

export function offerReportRateIdentity(userId: string): string {
  return `user:${userId}`;
}

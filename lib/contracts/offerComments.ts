/** Límite que admite hoy `public.comments.content varchar(280)` en producción. */
export const OFFER_COMMENT_DB_MAX_CHARS = 280;

/**
 * Límite objetivo. Solo puede activarse cuando
 * `docs/supabase-migrations/20261011_comments_content_500.sql` esté aplicada.
 */
export const OFFER_COMMENT_TARGET_MAX_CHARS = 500;

/** Límite activo en formulario, cliente y API: nunca mayor que lo que acepta la BD. */
export const OFFER_COMMENT_MAX_CHARS = OFFER_COMMENT_DB_MAX_CHARS;

export type OfferCommentTextAssessment =
  | { ok: true; text: string }
  | { ok: false; message: string };

export function assessOfferCommentText(
  raw: string,
  maxChars: number = OFFER_COMMENT_MAX_CHARS,
): OfferCommentTextAssessment {
  const text = raw.trim();
  if (text.length === 0 || text.length > maxChars) {
    return { ok: false, message: `Contenido entre 1 y ${maxChars} caracteres` };
  }
  return { ok: true, text };
}

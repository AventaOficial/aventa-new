import { OFFER_HUNTER_COMMENT_MAX } from '@/lib/contracts/offers';
import type { ListPriceComparison } from '@/lib/offers/listPriceComparison';
import { moderateUserText } from '@/lib/moderation/commentProfanity';

/**
 * Filtro editorial del comentario que un hunter automático propone para el comprador.
 * No reescribe texto: lo conserva tal cual o lo descarta. Moderación humana lo edita o borra.
 * Un comentario descartado nunca rechaza al candidato.
 */
export const HUNTER_COMMENT_MIN_CHARS = 12;

export const HUNTER_COMMENT_DROP_REASONS = [
  'INVALID_FORMAT',
  'TOO_SHORT',
  'TOO_LONG',
  'REPEATS_TITLE',
  'MENTIONS_BOT',
  'CONTAINS_LINK',
  'UNSUPPORTED_CLAIM',
  'DISCOUNT_NOT_CONFIRMED',
  'DISCOUNT_MISMATCH',
  'OFFENSIVE',
] as const;
export type HunterCommentDropReason = (typeof HUNTER_COMMENT_DROP_REASONS)[number];

export type HunterCommentReview =
  | { status: 'absent'; reason: null }
  | { status: 'kept'; reason: null }
  | { status: 'dropped'; reason: HunterCommentDropReason };

export type HunterCommentReviewResult = { comment: string | null; review: HunterCommentReview };

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const STORES =
  'amazon|walmart|liverpool|mercado ?libre|coppel|soriana|costco|sam\'?s|elektra|chedraui|bodega aurrera|home depot|sears|palacio de hierro|suburbia|aliexpress|temu|shein|ebay';

/** Afirmaciones que Aventa no puede demostrar con los datos de un candidato. */
const UNSUPPORTED_CLAIMS: readonly RegExp[] = [
  /\bhistoric[oa]s?\b|\bhistoricamente\b/,
  /\b(el|la|lo|los|las) mas barat[oa]s?\b|\bmas barat[oa]s? que\b|\bmejor precio\b|\bprecio mas bajo\b/,
  /\bultim[oa]s? (unidades|piezas|existencias)\b|\bquedan pocas?\b|\bse agota\b|\bagotarse\b|\bantes de que se acabe\b/,
  /\birrepetible\b|\bnunca antes\b|\bunica oportunidad\b|\bno te lo pierdas\b|\bsolo (por )?hoy\b/,
  /\bahorr(as|aras|arias)\b|\bahorr\w*\s+(\$|\d)/,
  new RegExp(`\\b(que en|vs\\.?|contra|frente a) (${STORES})\\b|\\botras tiendas\\b`),
];

/** El comentario se publica bajo la identidad editorial; el texto no puede presentarse como bot. */
const BOT_SELF_REFERENCE =
  /\bgrok\b|\bx\.?ai\b|\bchat ?gpt\b|\bbots?\b|\bmcp\b|\binteligencia artificial\b|\bmodelo de lenguaje\b|\b(soy|como|una|la|por|con) ia\b|\bhunters? ia\b/;

const DISCOUNT_WORDS = /\bdescuento|\brebaj|\bantes (costaba|estaba|\$)|\bprecio de lista\b/;
/** «100% algodón» no es un descuento; «-25%», «baja 25%» o «25% menos» sí. */
const DISCOUNT_PERCENT =
  /(?:[-\u2212]\s?|\b(?:baja|bajo|rebaja|rebajado|descuento de|menos)\s+(?:de\s+)?(?:un\s+)?)(\d+)\s*(?:%|por ciento)|(\d+)\s*(?:%|por ciento)\s+(?:de descuento|menos|off|abajo|por debajo)/g;

/**
 * @param comparison comparación ya admitida por la política de precios (lista de la página, no
 *   la que declara el bot). `null` = precio conocido sin descuento verificable.
 */
export function reviewHunterComment(
  raw: string | null | undefined,
  ctx: { title: string; comparison: ListPriceComparison | null },
): HunterCommentReviewResult {
  const comment = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!comment) return { comment: null, review: { status: 'absent', reason: null } };
  const drop = (reason: HunterCommentDropReason): HunterCommentReviewResult => ({
    comment: null,
    review: { status: 'dropped', reason },
  });

  const folded = fold(comment);
  const length = Array.from(comment).length;
  if (length < HUNTER_COMMENT_MIN_CHARS) return drop('TOO_SHORT');
  if (length > OFFER_HUNTER_COMMENT_MAX) return drop('TOO_LONG');
  const title = fold(ctx.title);
  if (title && (folded === title || title.includes(folded))) return drop('REPEATS_TITLE');
  if (/https?:|www\.|\.com\b|\.mx\b/.test(folded)) return drop('CONTAINS_LINK');
  if (BOT_SELF_REFERENCE.test(folded)) return drop('MENTIONS_BOT');
  // Voz editorial: ni groserías coloquiales.
  const language = moderateUserText(comment, { field: 'hunter_comment' });
  if (language.categories.some((c) => c !== 'spam' && c !== 'empty')) return drop('OFFENSIVE');
  if (UNSUPPORTED_CLAIMS.some((re) => re.test(folded))) return drop('UNSUPPORTED_CLAIM');

  const percents = [...folded.matchAll(DISCOUNT_PERCENT)].map((m) => Number(m[1] ?? m[2]));
  if (percents.length > 0 || DISCOUNT_WORDS.test(folded)) {
    if (!ctx.comparison) return drop('DISCOUNT_NOT_CONFIRMED');
    for (const claimed of percents) {
      if (ctx.comparison.percent == null || Math.abs(claimed - ctx.comparison.percent) > 1) {
        return drop('DISCOUNT_MISMATCH');
      }
    }
  }
  return { comment, review: { status: 'kept', reason: null } };
}

export const HUNTER_COMMENT_DROP_LABELS: Readonly<Record<HunterCommentDropReason, string>> = {
  INVALID_FORMAT: 'no es texto plano',
  TOO_SHORT: 'demasiado corto',
  TOO_LONG: `pasa de ${OFFER_HUNTER_COMMENT_MAX} caracteres`,
  REPEATS_TITLE: 'repite el título',
  MENTIONS_BOT: 'se presenta como bot o IA',
  CONTAINS_LINK: 'incluye un enlace',
  UNSUPPORTED_CLAIM: 'afirmación no demostrable',
  DISCOUNT_NOT_CONFIRMED: 'habla de descuento sin precio de lista confirmado',
  DISCOUNT_MISMATCH: 'el porcentaje no coincide con los precios',
  OFFENSIVE: 'lenguaje ofensivo o grosero',
};

/** Lectura tolerante de `bot_meta.hunter_comment` para moderación. */
export function parseHunterCommentReview(
  botMeta: unknown,
): { status: 'kept' | 'dropped'; reason: HunterCommentDropReason | null; submitted: string | null } | null {
  if (!botMeta || typeof botMeta !== 'object') return null;
  const node = (botMeta as Record<string, unknown>).hunter_comment;
  if (!node || typeof node !== 'object') return null;
  const n = node as Record<string, unknown>;
  if (n.status !== 'kept' && n.status !== 'dropped') return null;
  const reason =
    typeof n.reason === 'string' && (HUNTER_COMMENT_DROP_REASONS as readonly string[]).includes(n.reason)
      ? (n.reason as HunterCommentDropReason)
      : null;
  const submitted = typeof n.submitted === 'string' && n.submitted.trim() ? n.submitted.trim() : null;
  return { status: n.status, reason, submitted };
}

/**
 * Filtro ligero de comentarios: léxico ofensivo en español + heurísticas.
 * No sustituye la revisión humana; solo decide publicar / retener / bloquear.
 */

export type CommentModerationVerdict = 'allow' | 'hold' | 'block';

export type CommentModerationResult = {
  verdict: CommentModerationVerdict;
  reason?: string;
};

/** Lista corta de ofensas graves / insultos comunes (ES-MX). */
const BLOCK_TERMS = [
  'puto',
  'puta',
  'putos',
  'putas',
  'pendejo',
  'pendeja',
  'pendejos',
  'pendejas',
  'hijo de puta',
  'hija de puta',
  'hijueputa',
  'mierda',
  'verga',
  'chinga tu',
  'chinga tu madre',
  'vete a la verga',
  'pinche',
  'culero',
  'culera',
  'mamon',
  'mamón',
  'idiota',
  'imbecil',
  'imbécil',
  'estupido',
  'estúpido',
  'estupida',
  'estúpida',
  'retrasado',
  'retrasada',
  'maricon',
  'maricón',
  'joto',
  'naco',
  'naca',
  'basura humana',
  'te odio',
  'matar',
  'te mato',
  'muerte a',
];

const HOLD_TERMS = [
  'estafa',
  'estafador',
  'estafadora',
  'fraude',
  'scam',
  'fake',
  'falso',
  'mentira',
  'ladron',
  'ladrón',
  'roba',
  'spam',
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsTerm(haystack: string, term: string): boolean {
  const needle = normalizeForMatch(term);
  if (!needle) return false;
  if (needle.includes(' ')) return haystack.includes(needle);
  const re = new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`, 'i');
  return re.test(haystack);
}

/**
 * Evalúa el texto de un comentario.
 * - block: ofensa grave → rechazado
 * - hold: sospechoso → queda pending aunque el autor tenga reputación
 * - allow: limpio
 */
export function moderateCommentText(content: string): CommentModerationResult {
  const normalized = normalizeForMatch(content);
  if (!normalized) return { verdict: 'block', reason: 'vacío' };

  // Spam: muchos enlaces o repetición extrema
  const urlCount = (content.match(/https?:\/\//gi) ?? []).length;
  if (urlCount >= 3) return { verdict: 'hold', reason: 'demasiados enlaces' };

  const chars = normalized.replace(/\s/g, '');
  if (chars.length >= 12) {
    const unique = new Set(chars).size;
    if (unique <= 3) return { verdict: 'hold', reason: 'texto repetitivo' };
  }

  for (const term of BLOCK_TERMS) {
    if (containsTerm(normalized, term)) {
      return { verdict: 'block', reason: 'lenguaje ofensivo' };
    }
  }

  for (const term of HOLD_TERMS) {
    if (containsTerm(normalized, term)) {
      return { verdict: 'hold', reason: 'posible denuncia / acusación' };
    }
  }

  return { verdict: 'allow' };
}

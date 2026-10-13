/**
 * Filtro de texto de usuario en español de México: severidad + categoría + contexto.
 * Léxico local, sin IA ni APIs. No sustituye la revisión humana; solo decide
 * publicar / retener / bloquear.
 *
 * - Alta (amenazas, insultos discriminatorios, ofensas a la familia, acoso sexual) → bloquea.
 * - Media (insultos) → bloquea si va dirigida a una persona; retiene si no; permite si es
 *   autocrítica («me siento pendejo»).
 * - Baja (groserías coloquiales: «pinche», «no mames», «vale verga») → se publica.
 *   Criticar un producto o un precio con groserías no es motivo de censura.
 */

export type CommentModerationVerdict = 'allow' | 'hold' | 'block';
export type ContentSeverity = 'none' | 'low' | 'medium' | 'high';
export type ContentCategory =
  | 'threat'
  | 'hate'
  | 'insult'
  | 'harassment'
  | 'sexual'
  | 'vulgarity'
  | 'accusation'
  | 'spam'
  | 'empty';
export type UserTextField = 'comment' | 'offer_title' | 'offer_description' | 'hunter_comment';

export type UserTextModeration = {
  verdict: CommentModerationVerdict;
  severity: ContentSeverity;
  categories: ContentCategory[];
  /** Ids de las reglas que coincidieron (auditoría; no se muestran al usuario). */
  matches: string[];
  reason?: string;
  /** Mensaje para el autor cuando no se publica de inmediato. */
  userMessage?: string;
  directed: boolean;
};

export type CommentModerationResult = UserTextModeration;

type Rule = {
  id: string;
  /** Fragmento regex sobre texto normalizado (minúsculas, sin acentos). */
  pattern: string;
  category: ContentCategory;
  severity: Exclude<ContentSeverity, 'none'>;
  /** Solo cuenta si el texto se dirige a una persona (palabras ambiguas: «perra», «retrasado»). */
  requiresDirected?: boolean;
  /** La expresión ya se dirige a alguien («vete a la verga»). */
  directedByItself?: boolean;
};

const HIGH_RULES: readonly Rule[] = [
  {
    id: 'threat',
    category: 'threat',
    severity: 'high',
    pattern:
      '(te|los|las|lo|la|les) (voy|vamos|van) a (matar|partir la madre|romper la madre|madrear|golpear|quemar|desaparecer)' +
      '|te mato|los mato|te parto la madre|te rompo la madre|te voy a buscar' +
      '|ojala (te|se|les) (mueras?|muera|mueran)|ojala (te|les) de cancer' +
      '|muerte a (los |las )?(moderadores?|admins?|vendedor(es)?|ti|ustedes)' +
      '|(se|sabemos|se bien) donde vives',
  },
  {
    id: 'hate_slur',
    category: 'hate',
    severity: 'high',
    pattern: 'maricon(es)?|maricas?|jotos?|joton(es)?|mongolos?|mongolas?|mogolic[oa]s?|sidos[oa]s?',
  },
  {
    id: 'hate_dehumanize',
    category: 'hate',
    severity: 'high',
    pattern: 'basura humana|escoria humana|retrasad[oa]s? mental(es)?|subnormal(es)?',
  },
  {
    id: 'family_insult',
    category: 'insult',
    severity: 'high',
    pattern:
      'hij[oa]s? de (su )?(puta|perra)( madre)?|hijueputa|hdp|chinga(s)? (a )?tu (puta )?madre|tu puta madre|chingas a tu madre',
  },
  {
    id: 'sexual_harassment',
    category: 'sexual',
    severity: 'high',
    pattern: 'chupa(me|mela)? (la|el) (verga|pito)|mamame (la|el) \\p{L}+|te (voy a )?(coger|violar)|violar(te|la|lo)',
  },
];

/** Expresiones coloquiales que contienen palabras de la lista media pero no insultan. */
const IDIOMS: readonly string[] = [
  'puta madre',
  'a toda madre',
  'no mames',
  'pendejadas?',
  'ptm',
  'nmms',
  'a huevo',
  'ahuevo',
  'puras mamadas',
  'mamadas?',
  'vale madres?',
  'me vale',
];

const MEDIUM_RULES: readonly Rule[] = [
  {
    id: 'insult',
    category: 'insult',
    severity: 'medium',
    pattern:
      'pendej[oa]s?|pndj|imbeciles|imbecil|estupid[oa]s?|idiotas?|culer[oa]s?|mamon(a|es|as)?|put[oa]s?|nac[oa]s?|tarad[oa]s?|come ?mierdas?|lame ?huevos?',
  },
  {
    id: 'insult_ambiguous',
    category: 'insult',
    severity: 'medium',
    requiresDirected: true,
    pattern: 'perras?|zorras?|retrasad[oa]s?|ratas?',
  },
  {
    id: 'go_away',
    category: 'harassment',
    severity: 'medium',
    directedByItself: true,
    pattern: 'vete a la (verga|mierda|chingada)|vayanse a la (verga|mierda|chingada)|chingate|chinguense',
  },
  {
    id: 'hate_feeling',
    category: 'harassment',
    severity: 'medium',
    pattern: 'te odio|los odio|las odio|me das asco|das asco|dan asco',
  },
  { id: 'sexual', category: 'sexual', severity: 'medium', pattern: 'porno|pornografia|nudes|onlyfans' },
];

const LOW_RULES: readonly Rule[] = [
  {
    id: 'vulgarity',
    category: 'vulgarity',
    severity: 'low',
    pattern:
      'pinches?|mierdas?|vergas?|chingon(a|es|as)?|chingadas?|chingaderas?|cabron(a|es|as)?|no mames|nmms|ptm|puta madre|poca madre|pendejadas?|mamadas?|a huevo|ahuevo|alv|culo|carajo|joder',
  },
];

const ACCUSATION = 'estafa|estafador(a|es|as)?|fraude|scam|fake|falso|mentira|ladron(a|es|as)?|roba'.split('|');

/**
 * Señal de que el insulto apunta a una persona. «tu»/«ti» no cuentan: «tu pedido llegó retrasado»
 * o «tu oferta es basura» critican la oferta, no a alguien.
 */
const DIRECTED =
  /(?:^| )(eres|eras|seras|son|sean|seas|sos|te ves|se ven|usted|ustedes|el que|la que|los que|las que|quien (lo |la )?(subio|publico)|vendedor(es)?|moderador(es)?|admins?|autor|cazador)(?= |$)/u;

/** Autocrítica: «me siento pendejo», «qué idiota fui». */
const SELF_REFERENCE = /(?:^| )(me siento|me senti|soy|fui|me vi|me veo|yo)(?= |$)/u;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

/** Minúsculas, sin acentos, leetspeak en palabras con letras y «p u t o» unido. */
export function normalizeForMatch(text: string): string {
  const tokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/\s+/)
    .map((token) =>
      /\p{L}/u.test(token) && /[0-9@$]/.test(token)
        ? token.replace(/[0-9@$]/g, (c) => LEET[c] ?? c)
        : token
    )
    .join(' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const joined: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length >= 3) joined.push(run.join(''));
    else joined.push(...run);
    run = [];
  };
  for (const token of tokens) {
    if (/^\p{L}$/u.test(token)) run.push(token);
    else {
      flush();
      joined.push(token);
    }
  }
  flush();
  return joined.join(' ');
}

/**
 * Cada letra literal tolera repeticiones («pendejoooo», «putooo») sin colapsar el texto:
 * colapsar convertiría «perra» en «pera».
 */
function elastic(pattern: string): string {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '\\') {
      const end = pattern[i + 1] === 'p' && pattern[i + 2] === '{' ? pattern.indexOf('}', i) : i + 1;
      out += pattern.slice(i, end + 1);
      i = end;
    } else if (/[a-z]/.test(c) || c === '[') {
      const end = c === '[' ? pattern.indexOf(']', i) : i;
      const unit = pattern.slice(i, end + 1);
      out += pattern[end + 1] === '?' || pattern[end + 1] === '*' ? `(?:${unit}+)` : `${unit}+`;
      i = end;
    } else {
      out += c;
    }
  }
  return out;
}

function wordRegex(pattern: string): RegExp {
  return new RegExp(`(?:^| )(?:${elastic(pattern)})(?= |$)`, 'gu');
}

const COMPILED = {
  high: HIGH_RULES.map((r) => ({ ...r, re: wordRegex(r.pattern) })),
  medium: MEDIUM_RULES.map((r) => ({ ...r, re: wordRegex(r.pattern) })),
  low: LOW_RULES.map((r) => ({ ...r, re: wordRegex(r.pattern) })),
  idioms: wordRegex(IDIOMS.join('|')),
  accusation: wordRegex(ACCUSATION.join('|')),
};

function test(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

const REASONS: Record<ContentCategory, string> = {
  threat: 'amenaza',
  hate: 'insulto discriminatorio',
  insult: 'insulto',
  harassment: 'acoso',
  sexual: 'contenido sexual',
  vulgarity: 'lenguaje coloquial',
  accusation: 'posible denuncia / acusación',
  spam: 'posible spam',
  empty: 'vacío',
};

const BLOCK_MESSAGE =
  'No se puede publicar: contiene insultos, amenazas u ofensas. Puedes criticar la oferta o la tienda sin atacar a nadie.';
const HOLD_MESSAGE = 'Quedó en revisión: un moderador lo verá antes de publicarlo.';

/** Evalúa texto de usuario según el campo donde se publicará. */
export function moderateUserText(content: string, opts: { field?: UserTextField } = {}): UserTextModeration {
  const field = opts.field ?? 'comment';
  const normalized = normalizeForMatch(content);
  const result = (
    verdict: CommentModerationVerdict,
    severity: ContentSeverity,
    categories: ContentCategory[],
    matches: string[],
    directed: boolean
  ): UserTextModeration => ({
    verdict,
    severity,
    categories,
    matches,
    directed,
    ...(categories.length > 0 ? { reason: REASONS[categories[0]] } : {}),
    ...(verdict === 'block' ? { userMessage: BLOCK_MESSAGE } : verdict === 'hold' ? { userMessage: HOLD_MESSAGE } : {}),
  });

  if (!normalized) return result('block', 'none', ['empty'], [], false);

  const directed = DIRECTED.test(normalized);
  const selfOnly = !directed && SELF_REFERENCE.test(normalized);

  const high = COMPILED.high.filter((r) => test(r.re, normalized));
  if (high.length > 0) {
    return result('block', 'high', [...new Set(high.map((r) => r.category))], high.map((r) => r.id), directed);
  }

  const withoutIdioms = normalized.replace(COMPILED.idioms, ' ').replace(/\s+/g, ' ').trim();
  const medium = COMPILED.medium.filter(
    (r) => (!r.requiresDirected || directed) && test(r.re, withoutIdioms)
  );
  const low = COMPILED.low.filter((r) => test(r.re, normalized));

  if (medium.length > 0 && !selfOnly) {
    const categories = [...new Set(medium.map((r) => r.category))];
    const ids = medium.map((r) => r.id);
    const aimed = directed || medium.some((r) => r.directedByItself);
    const verdict: CommentModerationVerdict =
      field === 'hunter_comment' || (field === 'comment' && aimed) ? 'block' : 'hold';
    return result(verdict, 'medium', categories, ids, aimed);
  }

  const urlCount = (content.match(/https?:\/\//gi) ?? []).length;
  if (urlCount >= 3) return { ...result('hold', 'low', ['spam'], ['links'], directed), reason: 'demasiados enlaces' };

  const rawChars = content.replace(/\s/g, '');
  if (rawChars.length >= 12 && new Set(rawChars.toLowerCase()).size <= 3) {
    return { ...result('hold', 'low', ['spam'], ['repetitive'], directed), reason: 'texto repetitivo' };
  }
  if (/(whats ?app|wa\.me|telegram|t\.me)/i.test(content) && /\d{8,}|\d{2}[\s-]\d{4}[\s-]\d{4}/.test(content)) {
    return { ...result('hold', 'low', ['spam'], ['contact'], directed), reason: 'datos de contacto' };
  }

  if (field === 'comment' && test(COMPILED.accusation, normalized)) {
    return result('hold', 'low', ['accusation'], ['accusation'], directed);
  }

  if (low.length > 0 || medium.length > 0) {
    const ids = [...low.map((r) => r.id), ...medium.map((r) => `${r.id}:self`)];
    return result('allow', 'low', ['vulgarity'], ids, directed);
  }
  return result('allow', 'none', [], [], directed);
}

/** Compatibilidad: comentarios de ofertas. */
export function moderateCommentText(content: string): CommentModerationResult {
  return moderateUserText(content, { field: 'comment' });
}

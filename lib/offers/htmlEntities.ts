const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  reg: '®',
  trade: '™',
  copy: '©',
  deg: '°',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  iexcl: '¡',
  iquest: '¿',
  middot: '·',
  times: '×',
};

/** Letras acentuadas: el nombre distingue mayúscula (`&Ntilde;` ≠ `&ntilde;`). */
const CASED_ENTITIES: Record<string, string> = {
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  uuml: 'ü',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Uuml: 'Ü',
  Ntilde: 'Ñ',
};

/**
 * Una sola pasada sobre entidades HTML (`&amp;`, `&#34;`, `&#x27;`, `&ntilde;`…).
 * Una entidad desconocida o un code point inválido se deja tal cual.
 */
export function decodeHtmlAttributeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return match;
      }
      return String.fromCodePoint(code);
    }
    return CASED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

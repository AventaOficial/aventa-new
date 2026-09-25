import { extractAmazonAsin } from '@/lib/offers/offerUrlFingerprint';
import { extractMercadoLibreItemId } from '@/lib/offers/resolveMercadoLibreItem';
import { classifyPastedUrl, isEmbeddedAssetUrl } from './classifyPastedUrl';

export { isEmbeddedAssetUrl };

/** Tope de un pegado. El enriquecimiento sigue acotado; el parser no cambia de modelo. */
export const OFFER_BATCH_MAX = 10_000;

const URL_RE = /https?:\/\/[^\s<>"'`)\]\}]+/gi;

/** Prefer the markdown href over a homepage label, and rejoin a path split onto the next line. */
export function recoverPastedOfferText(text: string): string {
  const unwrapped = String(text ?? '').replace(
    /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_match, label: string, href: string) => {
      const labelUrl = /^https?:\/\//i.test(label.trim()) ? label.trim() : '';
      if (!labelUrl) return href;
      try {
        const labelPath = new URL(labelUrl).pathname.replace(/\/+$/, '') || '/';
        const hrefPath = new URL(href).pathname.replace(/\/+$/, '') || '/';
        return hrefPath.length >= labelPath.length ? href : labelUrl;
      } catch {
        return href;
      }
    },
  );
  const lines = unwrapped.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const next = (lines[i + 1] ?? '').trim();
    const current = line.trim();
    if (/^https?:\/\/\S+$/i.test(current) && /^\/(?!\/)\S+$/.test(next)) {
      out.push(current.replace(/\/+$/, '') + next);
      i += 1;
      continue;
    }
    if (
      /^https?:\/\/[^/\s]+\/?$/i.test(current) &&
      /^(?:dp|gp|tienda|p|ip|articulo|producto)\//i.test(next)
    ) {
      out.push(`${current.replace(/\/+$/, '')}/${next}`);
      i += 1;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function stripTrailingJunk(raw: string): string {
  return raw.trim().replace(/[.,;:!?)]+$/g, '');
}

export function offerBatchIdentityKey(url: string): string {
  const asin = extractAmazonAsin(url);
  if (asin) return `amz:${asin}`;
  const ml = extractMercadoLibreItemId(url);
  if (ml) return `ml:${ml}`;
  try {
    const u = new URL(url);
    return `u:${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

const COPY_LIST_RE = /^#{0,3}\s*urls?\s+listas(?:\s+para\s+copiar)?\b/i;
const CITATION_HEADING_RE = /^#{0,3}\s*(?:fuentes|referencias|bibliograf[ií]a|sources)\b/i;
const CITATION_MARK_RE = /^\[\d+\]/;
const OFFER_HEADING_RE = /^#{1,3}\s*oferta\b/i;

function normalizeHref(raw: string): string | null {
  const href = stripTrailingJunk(raw).replace(/^http:/i, 'https:');
  if (!href.startsWith('https://')) return null;
  return href;
}

/**
 * Solo URLs de producto. Citas y bibliografía no entran.
 * Dedup por ASIN / id ML / path.
 */
export function extractOfferUrlsFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let mode: 'offer' | 'citation' | 'copy' = 'offer';

  for (const rawLine of recoverPastedOfferText(text).split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s*/, '').trim();
    if (COPY_LIST_RE.test(line)) {
      mode = 'copy';
      continue;
    }
    if (CITATION_HEADING_RE.test(line) || CITATION_MARK_RE.test(line)) {
      mode = 'citation';
    } else if (OFFER_HEADING_RE.test(line)) {
      mode = 'offer';
    } else if (mode === 'citation' && line === '') {
      mode = 'offer';
    }

    const matches = line.match(URL_RE) ?? [];
    for (const raw of matches) {
      const href = normalizeHref(raw);
      if (!href) continue;
      const kind = classifyPastedUrl(href);
      if (kind !== 'product' && !(kind === 'unsupported' && mode !== 'citation')) continue;
      const key = offerBatchIdentityKey(href);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(href);
      if (out.length >= OFFER_BATCH_MAX) return out;
    }
  }
  return out;
}

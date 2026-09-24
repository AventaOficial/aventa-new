import { extractOfferUrlsFromText, isEmbeddedAssetUrl, offerBatchIdentityKey } from './extractOfferUrls';

export type PastedOfferHint = {
  url: string;
  title: string | null;
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  image: string | null;
  seller: string | null;
  availability: string | null;
  why: string | null;
};

export type OfferBatchDraft = {
  url: string;
  title: string;
  store: string;
  price: string;
  originalPrice: string;
  image: string;
  seller: string;
  availability: string;
  why: string;
};

function parseMxn(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t || t === '—' || t === '–' || t === '-') return null;
  const m = t.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const TITLE_RE = /^(?:t[íi]tulo|producto)\s*:\s*(.+)$/i;
const STORE_RE = /^tienda\s*:\s*(.+)$/i;
/** Current price only. "Precio anterior" does not match. */
const PRICE_RE = /^precio(?:\s+actual)?\s*:\s*(.+)$/i;
const PREVIOUS_RE = /^precio anterior(?:\s*\([^)]*\))?\s*:\s*(.+)$/i;
const WHY_RE = /^por qu[ée] es buena(?:\s*\([^)]*\))?\s*:\s*(.+)$/i;
const IMAGE_RE = /^(?:imagen|image(?:\s*url)?)\s*:\s*(.+)$/i;
const SELLER_RE = /^(?:seller|vendedor|vendido por)\s*:\s*(.+)$/i;
const STOCK_RE = /^(?:stock|disponibilidad)\s*:\s*(.+)$/i;

function lineValue(block: string, labelRe: RegExp): string | null {
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.replace(/^\s*[-*]\s*/, '').trim();
    const m = trimmed.match(labelRe);
    if (!m?.[1]) continue;
    const v = m[1].trim();
    if (!v || v === '—' || v === '–' || v === '-') return null;
    return v;
  }
  return null;
}

function firstUrl(block: string): string | null {
  const m = block.match(/https?:\/\/[^\s<>"'`)\]\}]+/i);
  if (!m?.[0]) return null;
  return m[0].replace(/[.,;:!?)]+$/g, '').replace(/^http:/i, 'https:');
}

/** Bloques estilo cazador (`### Oferta N` + viñetas). Si no hay bloques, devuelve []. */
export function parsePastedOfferDump(text: string): PastedOfferHint[] {
  const chunks = String(text ?? '').split(/###\s*Oferta\s+\d+/i).slice(1);
  const out: PastedOfferHint[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const url = firstUrl(chunk);
    if (!url) continue;
    const key = offerBatchIdentityKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url,
      title: lineValue(chunk, TITLE_RE),
      store: lineValue(chunk, STORE_RE),
      price: parseMxn(lineValue(chunk, PRICE_RE)),
      originalPrice: parseMxn(lineValue(chunk, PREVIOUS_RE)),
      image: lineValue(chunk, IMAGE_RE),
      seller: lineValue(chunk, SELLER_RE),
      availability: lineValue(chunk, STOCK_RE),
      why: lineValue(chunk, WHY_RE),
    });
  }
  return out;
}

function contextBeforeUrl(text: string, url: string): string {
  const idx = text.lastIndexOf(url);
  if (idx < 0) return '';
  const before = text.slice(0, idx);
  const prevUrls = before
    .match(/https?:\/\/[^\s<>"'`)\]\}]+/gi)
    ?.map((raw) => raw.replace(/[.,;:!?)]+$/g, ''))
    .filter((raw) => !isEmbeddedAssetUrl(raw));
  const prev = prevUrls?.length ? prevUrls[prevUrls.length - 1] : null;
  const prevAt = prev ? before.lastIndexOf(prev) : -1;
  const start = prevAt >= 0 ? prevAt + prev!.length : Math.max(0, idx - 700);
  return text.slice(start, idx);
}

function hintFromContext(text: string, url: string): PastedOfferHint {
  const block = contextBeforeUrl(text, url);
  return {
    url,
    title: lineValue(block, TITLE_RE),
    store: lineValue(block, STORE_RE),
    price: parseMxn(lineValue(block, PRICE_RE)),
    originalPrice: parseMxn(lineValue(block, PREVIOUS_RE)),
    image: lineValue(block, IMAGE_RE),
    seller: lineValue(block, SELLER_RE),
    availability: lineValue(block, STOCK_RE),
    why: lineValue(block, WHY_RE),
  };
}

/** HTTP failures of PDP enrichment. 429/5xx can be retried. 4xx cannot. */
export function classifyEnrichmentFailure(status: number): { retryable: boolean; message: string } {
  if (status === 429 || status >= 500) {
    return { retryable: true, message: 'La ficha no respondió. Se puede reintentar.' };
  }
  return { retryable: false, message: 'Este enlace no se pudo leer. No reintentes el mismo URL.' };
}

function moneyToInput(n: number | null): string {
  return n != null && Number.isFinite(n) ? String(n) : '';
}

/**
 * Une URLs detectadas + metadatos del dump.
 * Las URLs mandan el universo; el dump solo rellena título/precio si coinciden.
 */
export function buildOfferBatchDrafts(text: string): OfferBatchDraft[] {
  const urls = extractOfferUrlsFromText(text);
  const hints = parsePastedOfferDump(text);
  const byKey = new Map(hints.map((h) => [offerBatchIdentityKey(h.url), h]));
  return urls.map((url) => {
    const dumped = byKey.get(offerBatchIdentityKey(url));
    const near = hintFromContext(text, url);
    const hint = {
      title: dumped?.title ?? near.title,
      store: dumped?.store ?? near.store,
      price: dumped?.price ?? near.price,
      originalPrice: dumped?.originalPrice ?? near.originalPrice,
      image: dumped?.image ?? near.image,
      seller: dumped?.seller ?? near.seller,
      availability: dumped?.availability ?? near.availability,
      why: dumped?.why ?? near.why,
    };
    return {
      url,
      title: hint.title ?? '',
      store: hint.store ?? '',
      price: moneyToInput(hint.price),
      originalPrice: moneyToInput(hint.originalPrice),
      image: hint.image ?? '',
      seller: hint.seller ?? '',
      availability: hint.availability ?? '',
      why: hint.why ?? '',
    };
  });
}

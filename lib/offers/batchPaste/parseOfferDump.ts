import { extractOfferUrlsFromText, offerBatchIdentityKey } from './extractOfferUrls';

export type PastedOfferHint = {
  url: string;
  title: string | null;
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  why: string | null;
};

export type OfferBatchDraft = {
  url: string;
  title: string;
  store: string;
  price: string;
  originalPrice: string;
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
      title: lineValue(chunk, /^t[íi]tulo\s*:\s*(.+)$/i),
      store: lineValue(chunk, /^tienda\s*:\s*(.+)$/i),
      price: parseMxn(lineValue(chunk, /^precio actual\s*:\s*(.+)$/i)),
      originalPrice: parseMxn(lineValue(chunk, /^precio anterior(?:\s*\([^)]*\))?\s*:\s*(.+)$/i)),
      why: lineValue(chunk, /^por qu[ée] es buena(?:\s*\([^)]*\))?\s*:\s*(.+)$/i),
    });
  }
  return out;
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
    const hint = byKey.get(offerBatchIdentityKey(url));
    return {
      url,
      title: hint?.title ?? '',
      store: hint?.store ?? '',
      price: moneyToInput(hint?.price ?? null),
      originalPrice: moneyToInput(hint?.originalPrice ?? null),
      why: hint?.why ?? '',
    };
  });
}

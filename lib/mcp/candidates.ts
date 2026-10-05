import { createHash } from 'node:crypto';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste/extractOfferUrls';
import { isAllowedOfferParseHost } from '@/lib/server/fetchUrlSafety';
import {
  MCP_CURRENCY,
  MCP_MAX_PRICE,
  MCP_NOTE_MAX,
  MCP_OBSERVED_AT_FUTURE_SKEW_MS,
  MCP_OBSERVED_AT_MAX_AGE_MS,
  MCP_TITLE_MAX,
  MCP_URL_MAX,
  type CandidateRejectionCode,
} from '@/lib/mcp/contract';

/**
 * Validación semántica de candidatos MCP.
 * Todo lo que llega es una pista: nunca evidencia. Este módulo no hace fetch de ninguna URL.
 */

export type ValidCandidate = {
  index: number;
  url: string;
  identityKey: string;
  title: string;
  price: number;
  originalPrice: number | null;
  note: string | null;
  observedAt: string;
};

export type CandidateRejection = { index: number; code: CandidateRejectionCode };
export type CandidateDuplicate = { index: number; duplicateOf: number };

export type CandidateValidation = {
  valid: ValidCandidate[];
  rejected: CandidateRejection[];
  duplicatesInRequest: CandidateDuplicate[];
};

// Controles C0/C1, zero-width, marcas y overrides bidi, separadores de línea y BOM.
const UNSAFE_TEXT_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/;
const HTML_RE = /[<>]|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[');
}

/** URL https de tienda permitida, sin credenciales, puerto, query, fragmento ni IP literal. */
export function normalizeCandidateUrl(raw: unknown): { ok: true; url: string } | { ok: false; code: 'INVALID_URL' | 'UNSUPPORTED_HOST' } {
  if (typeof raw !== 'string') return { ok: false, code: 'INVALID_URL' };
  const value = raw.trim();
  if (!value || value.length > MCP_URL_MAX || /\s/.test(value) || UNSAFE_TEXT_RE.test(value) || value.includes('\\')) {
    return { ok: false, code: 'INVALID_URL' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: 'INVALID_URL' };
  }
  if (url.protocol !== 'https:') return { ok: false, code: 'INVALID_URL' };
  if (url.username || url.password || url.port) return { ok: false, code: 'INVALID_URL' };
  const host = url.hostname.toLowerCase();
  if (!host || host.endsWith('.') || !host.includes('.') || isIpLiteral(host)) {
    return { ok: false, code: 'INVALID_URL' };
  }
  if (!isAllowedOfferParseHost(host)) return { ok: false, code: 'UNSUPPORTED_HOST' };
  // La query puede cargar etiquetas de afiliado ajenas; la identidad del producto nunca depende de ella.
  if (value.includes('?') || value.includes('#')) return { ok: false, code: 'INVALID_URL' };
  return { ok: true, url: url.href };
}

function cleanText(raw: unknown, max: number, required: boolean): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return required ? { ok: false } : { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.normalize('NFC').trim();
  if (!value) return required ? { ok: false } : { ok: true, value: null };
  if (Array.from(value).length > max) return { ok: false };
  if (UNSAFE_TEXT_RE.test(value) || HTML_RE.test(value)) return { ok: false };
  return { ok: true, value };
}

function cleanMoney(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw <= 0 || raw > MCP_MAX_PRICE) return null;
  return Math.round(raw * 100) / 100;
}

function cleanObservedAt(raw: unknown, now: Date): string | null {
  if (typeof raw !== 'string' || !ISO_RE.test(raw.trim())) return null;
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) return null;
  if (t > now.getTime() + MCP_OBSERVED_AT_FUTURE_SKEW_MS) return null;
  if (t < now.getTime() - MCP_OBSERVED_AT_MAX_AGE_MS) return null;
  return new Date(t).toISOString();
}

function validateOne(raw: unknown, index: number, now: Date): ValidCandidate | CandidateRejection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { index, code: 'INVALID_CANDIDATE' };
  const c = raw as Record<string, unknown>;
  const url = normalizeCandidateUrl(c.url);
  if (!url.ok) return { index, code: url.code };
  const title = cleanText(c.title, MCP_TITLE_MAX, true);
  if (!title.ok || !title.value) return { index, code: 'INVALID_TITLE' };
  const price = cleanMoney(c.price);
  if (price == null) return { index, code: 'INVALID_PRICE' };
  let originalPrice: number | null = null;
  if (c.originalPrice !== undefined && c.originalPrice !== null) {
    originalPrice = cleanMoney(c.originalPrice);
    if (originalPrice == null || !(originalPrice > price)) return { index, code: 'INVALID_ORIGINAL_PRICE' };
  }
  if (c.currency !== MCP_CURRENCY) return { index, code: 'INVALID_CURRENCY' };
  const note = cleanText(c.note, MCP_NOTE_MAX, false);
  if (!note.ok) return { index, code: 'INVALID_NOTE' };
  const observedAt = cleanObservedAt(c.observedAt, now);
  if (!observedAt) return { index, code: 'INVALID_OBSERVED_AT' };
  return {
    index,
    url: url.url,
    identityKey: offerBatchIdentityKey(url.url),
    title: title.value,
    price,
    originalPrice,
    note: note.value,
    observedAt,
  };
}

/** Valida cada candidato por separado y conserva su índice original. */
export function validateCandidates(raw: readonly unknown[], now: Date = new Date()): CandidateValidation {
  const valid: ValidCandidate[] = [];
  const rejected: CandidateRejection[] = [];
  const duplicatesInRequest: CandidateDuplicate[] = [];
  const firstByIdentity = new Map<string, number>();
  raw.forEach((item, index) => {
    const result = validateOne(item, index, now);
    if ('code' in result) {
      rejected.push(result);
      return;
    }
    const first = firstByIdentity.get(result.identityKey);
    if (first !== undefined) {
      duplicatesInRequest.push({ index, duplicateOf: first });
      return;
    }
    firstByIdentity.set(result.identityKey, index);
    valid.push(result);
  });
  return { valid, rejected, duplicatesInRequest };
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Hash canónico del payload (orden de llaves irrelevante). Base de la idempotencia. */
export function canonicalSubmissionHash(input: { runId?: unknown; candidates: readonly unknown[] }): string {
  const canonical = stableStringify({ runId: input.runId ?? null, candidates: input.candidates });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

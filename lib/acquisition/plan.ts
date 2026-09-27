import { randomUUID } from 'node:crypto';
import { candidateKeyForUrl } from '@/lib/hunter/candidateIntelligence/buildCandidateRecord';
import { offerBatchIdentityKey } from '@/lib/offers/batchPaste';
import { ACQUISITION_MAX_TEXT_CHARS, ACQUISITION_MAX_URLS, ACQUISITION_SCOUT_DAILY_CAP } from './contract';

const URL_RE = /https?:\/\/[^\s<>"'`)\]\}]+/gi;

export type AcquisitionPlanItem = {
  raw: string;
  outcome: 'accepted' | 'duplicate' | 'invalid' | 'over_cap';
  url: string | null;
  identityKey: string | null;
  candidateKey: string | null;
};

export type AcquisitionPlan = {
  items: AcquisitionPlanItem[];
  received: number;
  accepted: number;
  duplicates: number;
  invalid: number;
  overCap: number;
};

export function acquisitionSubmissionId(sourceKey: string, externalRunId?: string | null): string {
  const external = String(externalRunId ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, '')
    .slice(0, 80);
  const suffix = external || randomUUID();
  return `acq:${sourceKey}:${suffix}`.slice(0, 160);
}

export function scoutDailyRoom(existingToday: number, incoming: number, cap = ACQUISITION_SCOUT_DAILY_CAP): boolean {
  if (!Number.isFinite(existingToday) || existingToday < 0) return false;
  return existingToday + incoming <= cap;
}

function cleanUrl(raw: string): string | null {
  const href = raw.trim().replace(/[.,;:!?)]+$/g, '').replace(/^http:/i, 'https:');
  if (!href.startsWith('https://')) return null;
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    return href;
  } catch {
    return null;
  }
}

/**
 * Normaliza un bloque de URLs con la identidad de lote (ASIN / ML / host+path).
 * No extrae la página y no publica.
 */
export function planAcquisitionUrls(text: string): AcquisitionPlan | { error: string } {
  const body = String(text ?? '');
  if (body.length > ACQUISITION_MAX_TEXT_CHARS) {
    return { error: `El texto supera ${ACQUISITION_MAX_TEXT_CHARS} caracteres.` };
  }
  const matches = body.match(URL_RE) ?? [];
  const items: AcquisitionPlanItem[] = [];
  const seenUrl = new Set<string>();
  const seenIdentity = new Set<string>();
  let accepted = 0;

  for (const raw of matches) {
    const url = cleanUrl(raw);
    if (!url) {
      items.push({ raw, outcome: 'invalid', url: null, identityKey: null, candidateKey: null });
      continue;
    }
    const urlKey = url.trim().toLowerCase();
    const identityKey = offerBatchIdentityKey(url);
    if (seenUrl.has(urlKey) || seenIdentity.has(identityKey)) {
      items.push({
        raw,
        outcome: 'duplicate',
        url,
        identityKey,
        candidateKey: candidateKeyForUrl(url),
      });
      continue;
    }
    if (accepted >= ACQUISITION_MAX_URLS) {
      items.push({ raw, outcome: 'over_cap', url, identityKey, candidateKey: candidateKeyForUrl(url) });
      continue;
    }
    seenUrl.add(urlKey);
    seenIdentity.add(identityKey);
    accepted++;
    items.push({
      raw,
      outcome: 'accepted',
      url,
      identityKey,
      candidateKey: candidateKeyForUrl(url),
    });
  }

  return {
    items,
    received: matches.length,
    accepted,
    duplicates: items.filter((item) => item.outcome === 'duplicate').length,
    invalid: items.filter((item) => item.outcome === 'invalid').length,
    overCap: items.filter((item) => item.outcome === 'over_cap').length,
  };
}

export function forbiddenAcquisitionMetadata(metadata: unknown): string | null {
  if (metadata == null) return null;
  if (typeof metadata !== 'object' || Array.isArray(metadata)) return 'metadata debe ser un objeto.';
  const json = JSON.stringify(metadata);
  if (json.length > 4000) return 'metadata es demasiado grande.';
  const blocked = ['offer_id', 'published', 'approved', 'offer_url', 'payout', 'commission'];
  for (const key of blocked) {
    if (Object.prototype.hasOwnProperty.call(metadata, key)) {
      return `metadata no puede incluir ${key}.`;
    }
  }
  return null;
}

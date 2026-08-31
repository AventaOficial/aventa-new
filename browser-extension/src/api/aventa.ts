import type { ExtensionConfig } from '../types/messages';

export interface CooldownStatus {
  exempt: boolean;
  canUpload: boolean;
  remainingSeconds: number;
  cooldownSeconds: number;
  reputationLevel: number;
}

export async function fetchCooldownStatus(
  accessToken: string,
  config: ExtensionConfig,
): Promise<CooldownStatus> {
  const base = config.aventaBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/me/upload-cooldown-status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('cooldown_fetch_failed');
  }
  const data = await res.json().catch(() => ({}));
  return {
    exempt: Boolean(data?.exempt),
    canUpload: data?.canUpload !== false,
    remainingSeconds: Math.max(0, Number(data?.remainingSeconds) || 0),
    cooldownSeconds: Math.max(0, Number(data?.cooldownSeconds) || 15),
    reputationLevel: Math.max(1, Number(data?.reputationLevel) || 1),
  };
}

export interface ParseOfferResult {
  title: string | null;
  image: string | null;
  images: string[];
  store: string | null;
  suggested_discount_price: number | null;
  suggested_original_price: number | null;
  suggested_category: string | null;
  reason: string | null;
  error?: string;
}

export async function parseOfferUrl(
  accessToken: string,
  config: ExtensionConfig,
  url: string,
): Promise<ParseOfferResult> {
  const base = config.aventaBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/parse-offer-url`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'parse_failed');
  }
  return data as ParseOfferResult;
}

export interface CreateOfferPayload {
  title: string;
  store: string;
  offer_url: string;
  price?: number;
  original_price?: number;
  hasDiscount?: boolean;
  image_url?: string;
  image_urls?: string[];
  category?: string;
}

export interface CreateOfferResult {
  ok?: boolean;
  id?: string;
  status?: 'pending' | 'approved';
  error?: string;
  duplicate_offer_id?: string;
  duplicate_status?: string;
}

export async function createOffer(
  accessToken: string,
  config: ExtensionConfig,
  payload: CreateOfferPayload,
): Promise<CreateOfferResult> {
  const base = config.aventaBase.replace(/\/$/, '');
  const res = await fetch(`${base}/api/offers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409) {
    return {
      error: typeof data?.error === 'string' ? data.error : 'duplicate',
      duplicate_offer_id: data?.duplicate_offer_id,
      duplicate_status: data?.duplicate_status,
    };
  }
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'create_failed');
  }
  return data as CreateOfferResult;
}

export function buildOfferPublicUrl(config: ExtensionConfig, offerId: string): string {
  const base = config.aventaBase.replace(/\/$/, '');
  return `${base}/oferta/${offerId}`;
}

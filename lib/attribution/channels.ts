/**
 * Taxonomía extensible de canales de acquisition.
 * Server-side only. No hardcodear lógica de negocio por canal en UI.
 */

export const ATTRIBUTION_CHANNELS = [
  'organic',
  'direct',
  'seo',
  'internal',
  'social',
  'tiktok',
  'instagram',
  'telegram',
  'whatsapp',
  'discord',
  'email',
  'paid',
  'unknown',
] as const;

export type AttributionChannel = (typeof ATTRIBUTION_CHANNELS)[number];

const CHANNEL_SET = new Set<string>(ATTRIBUTION_CHANNELS);

/** Mapeo allowlisted utm_source / referer host → canal. */
const UTM_TO_CHANNEL: Record<string, AttributionChannel> = {
  organic: 'organic',
  seo: 'seo',
  google: 'seo',
  direct: 'direct',
  internal: 'internal',
  feed: 'internal',
  home: 'internal',
  social: 'social',
  tiktok: 'tiktok',
  tt: 'tiktok',
  instagram: 'instagram',
  ig: 'instagram',
  telegram: 'telegram',
  tg: 'telegram',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  discord: 'discord',
  email: 'email',
  newsletter: 'email',
  paid: 'paid',
  ads: 'paid',
  meta: 'paid',
  facebook: 'paid',
};

const HOST_TO_CHANNEL: Array<{ match: RegExp; channel: AttributionChannel }> = [
  { match: /tiktok\.com$/i, channel: 'tiktok' },
  { match: /instagram\.com$/i, channel: 'instagram' },
  { match: /t\.me$/i, channel: 'telegram' },
  { match: /telegram\.org$/i, channel: 'telegram' },
  { match: /wa\.me$/i, channel: 'whatsapp' },
  { match: /whatsapp\.com$/i, channel: 'whatsapp' },
  { match: /discord\.com$/i, channel: 'discord' },
  { match: /discord\.gg$/i, channel: 'discord' },
  { match: /facebook\.com$/i, channel: 'social' },
  { match: /twitter\.com$/i, channel: 'social' },
  { match: /x\.com$/i, channel: 'social' },
  { match: /google\./i, channel: 'seo' },
  { match: /bing\.com$/i, channel: 'seo' },
];

export function isAttributionChannel(raw: string | null | undefined): raw is AttributionChannel {
  return Boolean(raw && CHANNEL_SET.has(raw));
}

/**
 * Resuelve canal. Nunca confía en merchant/campaign inventados.
 * Preferencia: utm allowlisted → referer host → unknown.
 */
export function resolveAttributionChannel(input: {
  utmSource?: string | null;
  referer?: string | null;
}): AttributionChannel {
  const utm = (input.utmSource ?? '').trim().toLowerCase();
  if (utm && UTM_TO_CHANNEL[utm]) return UTM_TO_CHANNEL[utm]!;

  const ref = (input.referer ?? '').trim();
  if (ref) {
    try {
      const host = new URL(ref).hostname.replace(/^www\./i, '');
      for (const rule of HOST_TO_CHANNEL) {
        if (rule.match.test(host)) return rule.channel;
      }
    } catch {
      // referer malformado → ignore
    }
  }

  if (!utm && !ref) return 'direct';
  return 'unknown';
}

/**
 * Campaign key: solo allowlist / formato seguro.
 * Rechaza payloads libres del cliente.
 */
export function resolveCampaignKey(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  // Solo slug corto alfanumérico + guiones/guion bajo (max 64).
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(v)) return null;
  return v;
}

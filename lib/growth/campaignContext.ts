/**
 * Contexto de campaña de adquisición. No es dinero.
 * No guarda IP, correo, token ni datos fiscales.
 * El slug pasa por la misma regla que campaign_key.
 */

import { resolveAttributionChannel, resolveCampaignKey, type AttributionChannel } from '@/lib/attribution/channels';

export const CAMPAIGN_COOKIE = 'aventa_acq';
export const CAMPAIGN_QUERY_HEADER = 'x-aventa-campaign';
export const CAMPAIGN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const SALES_TARGET = 10_000;
export const SALES_WINDOW_DAYS = 90;
/** Medianoche de Ciudad de México del 1 de noviembre de 2026. */
export const SALES_WINDOW_START_MS = Date.parse('2026-11-01T06:00:00.000Z');

export type CampaignContext = {
  source: AttributionChannel;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

const EMPTY: CampaignContext = {
  source: 'direct',
  medium: null,
  campaign: null,
  content: null,
  term: null,
};

function slug(raw: string | null | undefined): string | null {
  return resolveCampaignKey(raw);
}

export function parseCampaignSearch(search: string): CampaignContext | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const sourceRaw = params.get('utm_source');
  const medium = slug(params.get('utm_medium'));
  const campaign = slug(params.get('utm_campaign'));
  const content = slug(params.get('utm_content'));
  const term = slug(params.get('utm_term'));
  if (!sourceRaw && !medium && !campaign && !content && !term) return null;
  const source = resolveAttributionChannel({ utmSource: sourceRaw });
  return { source, medium, campaign, content, term };
}

export function serializeCampaignCookie(context: CampaignContext): string {
  const parts = [
    context.source,
    context.medium ?? '',
    context.campaign ?? '',
    context.content ?? '',
    context.term ?? '',
  ];
  return parts.join('.').slice(0, 180);
}

export function parseCampaignCookie(raw: string | null | undefined): CampaignContext | null {
  if (!raw) return null;
  const [source, medium, campaign, content, term] = raw.split('.');
  if (!source) return null;
  const channel = resolveAttributionChannel({ utmSource: source });
  return {
    source: channel,
    medium: slug(medium),
    campaign: slug(campaign),
    content: slug(content),
    term: slug(term),
  };
}

export function campaignMetadata(context: CampaignContext | null): Record<string, string> {
  if (!context) return {};
  const out: Record<string, string> = { utm_source: context.source };
  if (context.medium) out.utm_medium = context.medium;
  if (context.campaign) out.utm_campaign = context.campaign;
  if (context.content) out.utm_content = context.content;
  if (context.term) out.utm_term = context.term;
  return out;
}

export function resolveRequestCampaign(search: string, pathname: string): CampaignContext | null {
  const fromQuery = parseCampaignSearch(search);
  const fromPath = campaignFromLandingPath(pathname);
  if (!fromQuery) return fromPath;
  if (!fromPath) return fromQuery;
  return {
    source: fromQuery.source,
    medium: fromQuery.medium ?? fromPath.medium,
    campaign: fromQuery.campaign ?? fromPath.campaign,
    content: fromQuery.content ?? fromPath.content,
    term: fromQuery.term ?? fromPath.term,
  };
}

export function campaignFromLandingPath(pathname: string): CampaignContext | null {
  const match = pathname.match(/^\/go\/([a-z0-9][a-z0-9_-]{0,63})\/?$/);
  if (!match) return null;
  const campaign = slug(match[1]);
  if (!campaign) return null;
  return { source: 'direct', medium: 'landing', campaign, content: null, term: null };
}

export function readCampaignFromCookieHeader(header: string | null | undefined): CampaignContext | null {
  if (!header) return null;
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${CAMPAIGN_COOKIE}=`));
  if (!match) return null;
  return parseCampaignCookie(decodeURIComponent(match.slice(CAMPAIGN_COOKIE.length + 1)));
}

export { EMPTY as EMPTY_CAMPAIGN };

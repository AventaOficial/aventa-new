/**
 * Contexto de atribución resuelto 100% server-side.
 * Ignora merchant/campaign/channel inventados por el cliente salvo allowlist.
 */

import {
  isAttributionChannel,
  resolveAttributionChannel,
  resolveCampaignKey,
  type AttributionChannel,
} from './channels';

export type ClientAttributionHints = {
  /** utm_source crudo — se mapea a taxonomía o se descarta. */
  utmSource?: string | null;
  /** campaign slug — solo si pasa resolveCampaignKey. */
  campaign?: string | null;
  /** channel crudo — solo si es AttributionChannel válido. */
  channel?: string | null;
  referer?: string | null;
};

export type ServerAttributionContext = {
  channel: AttributionChannel;
  campaignKey: string | null;
  /** Siempre track_outbound en este path. */
  source: 'track_outbound';
  completeness: {
    hasChannel: boolean;
    hasCampaign: boolean;
    channelTrusted: boolean;
  };
};

/**
 * Resuelve contexto. Preferencia:
 * 1) channel exacto de taxonomía si el cliente lo envía
 * 2) utm/referer server-side
 * Campaign solo si slug válido.
 */
export function resolveServerAttributionContext(
  hints: ClientAttributionHints = {},
): ServerAttributionContext {
  const campaignKey = resolveCampaignKey(hints.campaign);
  const hintedChannel = (hints.channel ?? '').trim().toLowerCase();

  let channel: AttributionChannel;
  if (isAttributionChannel(hintedChannel)) {
    channel = hintedChannel;
  } else {
    channel = resolveAttributionChannel({
      utmSource: hints.utmSource,
      referer: hints.referer,
    });
  }

  return {
    channel,
    campaignKey,
    source: 'track_outbound',
    completeness: {
      hasChannel: channel !== 'unknown',
      hasCampaign: campaignKey != null,
      channelTrusted: isAttributionChannel(hintedChannel) || channel !== 'unknown',
    },
  };
}

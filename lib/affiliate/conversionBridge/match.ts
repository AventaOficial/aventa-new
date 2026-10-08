/**
 * Enlace determinista: referencia del proveedor → clic de Aventa.
 * Sin coincidencia exacta y única, la venta queda UNMATCHED.
 * No se atribuye por hora, texto parecido ni campaña declarada por el proveedor.
 */

import type { ActorKind, CampaignAttribution } from './contract';

export type ClickSnapshot = {
  clickId: string;
  offerId: string | null;
  references: string[];
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  campaignKey: string | null;
  actorType: ActorKind;
  hunterUserId: string | null;
};

export type MatchResult = {
  status: 'MATCHED' | 'UNMATCHED';
  clickId: string | null;
  offerId: string | null;
  actorType: ActorKind;
  hunterUserId: string | null;
  hunterRewardEligible: boolean;
  campaign: CampaignAttribution;
};

const UNKNOWN_CAMPAIGN: CampaignAttribution = {
  status: 'UNKNOWN',
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmContent: null,
  utmTerm: null,
};

function unmatched(): MatchResult {
  return {
    status: 'UNMATCHED',
    clickId: null,
    offerId: null,
    actorType: 'UNKNOWN',
    hunterUserId: null,
    hunterRewardEligible: false,
    campaign: UNKNOWN_CAMPAIGN,
  };
}

function campaignFromClick(click: ClickSnapshot): CampaignAttribution {
  const utmCampaign = click.utmCampaign ?? click.campaignKey;
  const has =
    Boolean(click.utmSource) ||
    Boolean(click.utmMedium) ||
    Boolean(utmCampaign) ||
    Boolean(click.utmContent) ||
    Boolean(click.utmTerm);
  if (!has) return UNKNOWN_CAMPAIGN;
  return {
    status: 'ATTRIBUTED',
    utmSource: click.utmSource,
    utmMedium: click.utmMedium,
    utmCampaign,
    utmContent: click.utmContent,
    utmTerm: click.utmTerm,
  };
}

export function matchClickReference(
  clickReference: string | null | undefined,
  offerReference: string | null | undefined,
  clicks: readonly ClickSnapshot[],
): MatchResult {
  const reference = (clickReference ?? '').trim();
  if (!reference) return unmatched();

  const hits = clicks.filter((click) => {
    const tokens = new Set([click.clickId, ...click.references].map((token) => token.trim()).filter(Boolean));
    return tokens.has(reference);
  });
  if (hits.length !== 1) return unmatched();

  const click = hits[0]!;
  const offerRef = (offerReference ?? '').trim();
  if (offerRef && click.offerId && offerRef !== click.offerId) return unmatched();

  const actorType = click.actorType;
  return {
    status: 'MATCHED',
    clickId: click.clickId,
    offerId: click.offerId,
    actorType,
    hunterUserId: actorType === 'HUMAN' ? click.hunterUserId : null,
    hunterRewardEligible: actorType === 'HUMAN' && Boolean(click.hunterUserId),
    campaign: campaignFromClick(click),
  };
}

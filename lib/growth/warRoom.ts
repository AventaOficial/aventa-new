import { SALES_TARGET, SALES_WINDOW_START_MS } from './campaignContext';
import type { GrowthProviderSnapshot, ProviderDatasetState } from '@/lib/affiliate/conversionBridge/growthRead';
import {
  conversionRate,
  growthAlerts,
  largestBottleneck,
  paceStatus,
  rankRetailers,
  remainingDays,
  requiredDailyRunRate,
  revenuePerClick,
  trackingHealth,
  type FunnelStep,
  type GrowthAlert,
  type MeasuredCount,
  type PaceStatus,
  type TrackingHealth,
} from './pacing';

export type GrowthWindowView = {
  label: string;
  visitors: MeasuredCount;
  offerViews: MeasuredCount;
  outboundClicks: MeasuredCount;
  confirmedSales: MeasuredCount;
  confirmedCommissionCents: MeasuredCount;
  salesLabel: 'DATA_INCOMPLETE' | 'DATA_NOT_AVAILABLE' | 'MEASURED' | 'PARTIAL_DATA' | 'DATA_DELAYED' | 'PROVIDER_IMPORT_FAILED';
  conversionRate: number | null;
  revenuePerClickCents: number | null;
  pendingConversions: number | null;
  reversedConversions: number | null;
  unmatchedConversions: number | null;
};

export type GrowthWarRoomView = {
  question: '¿Estamos en camino a 10,000 ventas?';
  target: number;
  windowStarted: boolean;
  today: GrowthWindowView;
  d7: GrowthWindowView;
  d30: GrowthWindowView;
  sinceLaunch: GrowthWindowView;
  requiredDaily: number | null;
  currentDaily: number | null;
  pace: PaceStatus;
  projectedFinish: string | null;
  bottleneck: { from: string; to: string; rate: number } | null;
  tracking: TrackingHealth;
  affiliateConfirmation: ProviderDatasetState;
  providerDetail: string;
  lastSuccessfulImportAt: string | null;
  lastProviderDataAt: string | null;
  channels: Array<{ channel: string; clicks: number; confirmedSales: number | null; confirmedCommissionCents: number | null }>;
  campaigns: Array<{ campaignKey: string; source: string | null; content: string | null; clicks: number; confirmedSales: number | null; confirmedCommissionCents: number | null }>;
  offers: Array<{
    offerId: string;
    clicks: number;
    pendingConversions: number | null;
    confirmedSales: number | null;
    reversedConversions: number | null;
    confirmedCommissionCents: number | null;
  }>;
  retailers: { best: string | null; worst: string | null; insufficient: string[] };
  content: Array<{ contentId: string; confirmedSales: number; confirmedCommissionCents: number }>;
  contentSales: 'DATA_NOT_AVAILABLE' | 'MEASURED';
  spend: 'DATA_NOT_AVAILABLE';
  roas: null;
  alerts: GrowthAlert[];
};

function currentDailySales(confirmedSales: number | null, nowMs: number): number | null {
  if (confirmedSales == null || nowMs < SALES_WINDOW_START_MS) return null;
  const elapsed = Math.max(1, Math.floor((nowMs - SALES_WINDOW_START_MS) / 86_400_000) + 1);
  return confirmedSales / elapsed;
}

function windowView(
  label: string,
  input: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount },
  conversionConnected: boolean,
  measured?: GrowthProviderSnapshot['today'],
  state?: ProviderDatasetState,
): GrowthWindowView {
  const show = measured != null && (state === 'CONNECTED' || state === 'PARTIAL_DATA');
  const confirmedSales = show ? measured.confirmedSales : null;
  const confirmedCommissionCents = show ? measured.confirmedCommissionCents : null;
  const salesLabel = !show
    ? state === 'DATA_DELAYED'
      ? 'DATA_DELAYED'
      : state === 'PROVIDER_IMPORT_FAILED'
        ? 'PROVIDER_IMPORT_FAILED'
        : state === 'PARTIAL_DATA'
          ? 'PARTIAL_DATA'
          : conversionConnected
            ? 'DATA_NOT_AVAILABLE'
            : 'DATA_INCOMPLETE'
    : state === 'PARTIAL_DATA'
      ? 'PARTIAL_DATA'
      : 'MEASURED';
  return {
    label,
    visitors: input.visitors,
    offerViews: input.offerViews,
    outboundClicks: input.outboundClicks,
    confirmedSales,
    confirmedCommissionCents,
    salesLabel,
    conversionRate: conversionRate(confirmedSales, input.outboundClicks),
    revenuePerClickCents: revenuePerClick(confirmedCommissionCents, input.outboundClicks),
    pendingConversions: show ? measured.pendingConversions : null,
    reversedConversions: show ? measured.reversedConversions : null,
    unmatchedConversions: show ? measured.unmatchedConversions : null,
  };
}

export function buildGrowthWarRoomView(input: {
  nowMs: number;
  conversionConnected: boolean;
  today: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount };
  d7: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount };
  d30: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount };
  sinceLaunch: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount };
  completenessPct: number | null;
  outboundVolume: number | null;
  attributedClicks: number | null;
  byChannel: Array<{ channel: string; clicks: number }>;
  byCampaign: Array<{ campaignKey: string; clicks: number }>;
  byNetwork: Array<{ network: string; clicks: number }>;
  topOffers: Array<{ offerId: string; clicks: number }>;
  provider?: GrowthProviderSnapshot;
}): GrowthWarRoomView {
  const started = input.nowMs >= SALES_WINDOW_START_MS;
  const provider = input.provider;
  const state = provider?.state;
  const today = windowView('TODAY', input.today, input.conversionConnected, provider?.today, state);
  const d7 = windowView('7D', input.d7, input.conversionConnected, provider?.d7, state);
  const d30 = windowView('30D', input.d30, input.conversionConnected, provider?.d30, state);
  const sinceLaunch = started
    ? windowView('SINCE_LAUNCH', input.sinceLaunch, input.conversionConnected, provider?.sinceLaunch, state)
    : windowView('SINCE_LAUNCH', { visitors: null, offerViews: null, outboundClicks: null }, input.conversionConnected, null, state);

  const steps: FunnelStep[] = [
    { id: 'visitors', count: today.visitors },
    { id: 'offer_views', count: today.offerViews },
    { id: 'outbound', count: today.outboundClicks },
    { id: 'confirmed_sales', count: today.confirmedSales },
  ];

  return {
    question: '¿Estamos en camino a 10,000 ventas?',
    target: SALES_TARGET,
    windowStarted: started,
    today,
    d7,
    d30,
    sinceLaunch,
    requiredDaily: started ? requiredDailyRunRate(sinceLaunch.confirmedSales, input.nowMs) : null,
    currentDaily: currentDailySales(sinceLaunch.confirmedSales, input.nowMs),
    pace: paceStatus({
      confirmedSales: sinceLaunch.confirmedSales,
      currentDaily: currentDailySales(sinceLaunch.confirmedSales, input.nowMs),
      nowMs: input.nowMs,
    }),
    projectedFinish: null,
    bottleneck: largestBottleneck(steps),
    tracking: trackingHealth({
      outboundVolume: input.outboundVolume,
      attributedClicks: input.attributedClicks,
      completenessPct: input.completenessPct,
      conversionConnected: input.conversionConnected,
    }),
    affiliateConfirmation: provider?.state ?? (input.conversionConnected ? 'CONNECTED' : 'DATA_INCOMPLETE'),
    providerDetail: provider?.detail ?? (input.conversionConnected ? 'connected' : 'affiliate_confirmation_not_connected'),
    lastSuccessfulImportAt: provider?.lastSuccessfulImportAt ?? null,
    lastProviderDataAt: provider?.lastProviderDataAt ?? null,
    channels: input.byChannel.map((row) => {
      const confirmed = provider?.channels.find((item) => item.channel === row.channel);
      return {
        ...row,
        confirmedSales: confirmed?.confirmedSales ?? null,
        confirmedCommissionCents: confirmed?.confirmedCommissionCents ?? null,
      };
    }),
    campaigns: input.byCampaign.map((row) => {
      const confirmed = provider?.campaigns.find((item) => item.campaignKey === row.campaignKey);
      return {
        campaignKey: row.campaignKey,
        source: confirmed?.source ?? null,
        content: confirmed?.content ?? null,
        clicks: row.clicks,
        confirmedSales: confirmed?.confirmedSales ?? null,
        confirmedCommissionCents: confirmed?.confirmedCommissionCents ?? null,
      };
    }),
    offers: input.topOffers.map((row) => {
      const confirmed = provider?.offers.find((item) => item.offerId === row.offerId);
      return {
        offerId: row.offerId,
        clicks: row.clicks,
        pendingConversions: confirmed?.pendingConversions ?? null,
        confirmedSales: confirmed?.confirmedSales ?? null,
        reversedConversions: confirmed?.reversedConversions ?? null,
        confirmedCommissionCents: confirmed?.confirmedCommissionCents ?? null,
      };
    }),
    retailers: rankRetailers(
      input.byNetwork.map((row) => ({
        id: row.network,
        clicks: row.clicks,
        conversions: provider?.retailers.find((item) => item.id === row.network)?.confirmedSales ?? null,
      })),
    ),
    content: provider?.content ?? [],
    contentSales: provider?.content.length ? 'MEASURED' : 'DATA_NOT_AVAILABLE',
    spend: 'DATA_NOT_AVAILABLE',
    roas: null,
    alerts: growthAlerts({
      outboundClicks: today.outboundClicks,
      previousOutbound: null,
      confirmedSales: today.confirmedSales,
      previousSales: null,
      conversionConnected: input.conversionConnected,
    }),
  };
}

export function budgetDecision(input: {
  spendCents: MeasuredCount;
  visitors: MeasuredCount;
  clicks: MeasuredCount;
  confirmedSales: MeasuredCount;
  confirmedCommissionCents: MeasuredCount;
  estimatedCommissionCents: MeasuredCount;
}): {
  cacCents: number | null;
  costPerOutboundCents: number | null;
  costPerSaleCents: number | null;
  revenuePerSaleCents: number | null;
  roas: number | null;
  commissionKind: 'CONFIRMED' | 'ESTIMATED' | 'DATA_INCOMPLETE';
} {
  const confirmed = input.confirmedCommissionCents;
  const estimated = input.estimatedCommissionCents;
  const commissionKind = confirmed != null ? 'CONFIRMED' : estimated != null ? 'ESTIMATED' : 'DATA_INCOMPLETE';
  const revenue = confirmed;
  return {
    cacCents: input.spendCents != null && input.visitors != null && input.visitors > 0 ? input.spendCents / input.visitors : null,
    costPerOutboundCents: input.spendCents != null && input.clicks != null && input.clicks > 0 ? input.spendCents / input.clicks : null,
    costPerSaleCents: input.spendCents != null && input.confirmedSales != null && input.confirmedSales > 0 ? input.spendCents / input.confirmedSales : null,
    revenuePerSaleCents: revenue != null && input.confirmedSales != null && input.confirmedSales > 0 ? revenue / input.confirmedSales : null,
    roas: revenue != null && input.spendCents != null && input.spendCents > 0 ? revenue / input.spendCents : null,
    commissionKind,
  };
}

export { conversionRate, revenuePerClick, remainingDays, paceStatus };

import { SALES_TARGET, SALES_WINDOW_START_MS } from './campaignContext';
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
  salesLabel: 'DATA_INCOMPLETE' | 'DATA_NOT_AVAILABLE' | 'MEASURED';
  conversionRate: number | null;
  revenuePerClickCents: number | null;
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
  affiliateConfirmation: 'DATA_INCOMPLETE' | 'CONNECTED';
  channels: Array<{ channel: string; clicks: number; confirmedSales: null }>;
  campaigns: Array<{ campaignKey: string; clicks: number; confirmedSales: null }>;
  offers: Array<{ offerId: string; clicks: number; confirmedSales: null; confirmedCommissionCents: null }>;
  retailers: { best: null; worst: null; insufficient: string[] };
  contentSales: 'DATA_NOT_AVAILABLE';
  spend: 'DATA_NOT_AVAILABLE';
  roas: null;
  alerts: GrowthAlert[];
};

function windowView(
  label: string,
  input: { visitors: MeasuredCount; offerViews: MeasuredCount; outboundClicks: MeasuredCount },
  conversionConnected: boolean,
): GrowthWindowView {
  return {
    label,
    visitors: input.visitors,
    offerViews: input.offerViews,
    outboundClicks: input.outboundClicks,
    confirmedSales: null,
    confirmedCommissionCents: null,
    salesLabel: conversionConnected ? 'DATA_NOT_AVAILABLE' : 'DATA_INCOMPLETE',
    conversionRate: null,
    revenuePerClickCents: null,
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
}): GrowthWarRoomView {
  const started = input.nowMs >= SALES_WINDOW_START_MS;
  const today = windowView('TODAY', input.today, input.conversionConnected);
  const d7 = windowView('7D', input.d7, input.conversionConnected);
  const d30 = windowView('30D', input.d30, input.conversionConnected);
  const sinceLaunch = started
    ? windowView('SINCE_LAUNCH', input.sinceLaunch, input.conversionConnected)
    : windowView('SINCE_LAUNCH', { visitors: null, offerViews: null, outboundClicks: null }, input.conversionConnected);

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
    currentDaily: null,
    pace: 'DATA_INSUFFICIENT',
    projectedFinish: null,
    bottleneck: largestBottleneck(steps),
    tracking: trackingHealth({
      outboundVolume: input.outboundVolume,
      attributedClicks: input.attributedClicks,
      completenessPct: input.completenessPct,
      conversionConnected: input.conversionConnected,
    }),
    affiliateConfirmation: input.conversionConnected ? 'CONNECTED' : 'DATA_INCOMPLETE',
    channels: input.byChannel.map((row) => ({ ...row, confirmedSales: null })),
    campaigns: input.byCampaign.map((row) => ({ ...row, confirmedSales: null })),
    offers: input.topOffers.map((row) => ({
      ...row,
      confirmedSales: null,
      confirmedCommissionCents: null,
    })),
    retailers: {
      ...rankRetailers(input.byNetwork.map((row) => ({ id: row.network, clicks: row.clicks, conversions: null }))),
      best: null,
      worst: null,
    },
    contentSales: 'DATA_NOT_AVAILABLE',
    spend: 'DATA_NOT_AVAILABLE',
    roas: null,
    alerts: growthAlerts({
      outboundClicks: today.outboundClicks,
      previousOutbound: null,
      confirmedSales: null,
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

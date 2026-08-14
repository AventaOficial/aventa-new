import type { MarketConfig } from '@/lib/markets/types';
import {
  COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  COMMISSION_MIN_PAYOUT_CENTS,
  COMMISSION_PAYOUT_HOLD_DAYS,
} from '@/lib/commissions/constants';

/** México — mercado fundador. */
export const MARKET_MX: MarketConfig = {
  id: 'mx',
  countryCode: 'MX',
  nameEs: 'México',
  locale: 'es-MX',
  currency: 'MXN',
  defaultCreatorShareBps: COMMISSION_DEFAULT_CREATOR_SHARE_BPS,
  minPayoutCents: COMMISSION_MIN_PAYOUT_CENTS,
  payoutHoldDays: COMMISSION_PAYOUT_HOLD_DAYS,
  affiliateNetworks: ['mercadolibre', 'amazon', 'walmart', 'other'],
  taxIdLabel: 'RFC',
  payoutMethod: 'spei',
  commissionsEnabled: true,
};

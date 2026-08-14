import { MARKET_MX } from '@/lib/markets/mx';
import { ACTIVE_MARKET_ID, type MarketConfig, type MarketId } from '@/lib/markets/types';

const REGISTRY: Partial<Record<MarketId, MarketConfig>> = {
  mx: MARKET_MX,
  // co / ar / … se añaden cuando haya red afiliada + payout + compliance locales
};

export function getMarket(id: MarketId = ACTIVE_MARKET_ID): MarketConfig {
  const market = REGISTRY[id];
  if (!market) {
    return MARKET_MX;
  }
  return market;
}

export function getActiveMarket(): MarketConfig {
  return getMarket(ACTIVE_MARKET_ID);
}

export function listConfiguredMarkets(): MarketConfig[] {
  return Object.values(REGISTRY).filter(Boolean) as MarketConfig[];
}

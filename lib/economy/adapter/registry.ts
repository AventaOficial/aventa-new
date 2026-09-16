/**
 * Adapter registry — production starts empty (fail-closed).
 * Live networks register explicitly in a future phase.
 */

import type { AffiliateNetwork } from '../types';
import { createNotConnectedAdapter } from './notConnectedAdapter';
import type { AffiliateNetworkAdapter } from './types';

const registry = new Map<string, AffiliateNetworkAdapter>();

export function registerAffiliateNetworkAdapter(adapter: AffiliateNetworkAdapter): void {
  if (!adapter.connected) {
    throw new Error('Refuse to register disconnected adapter as live');
  }
  registry.set(adapter.network, adapter);
}

export function unregisterAffiliateNetworkAdapter(network: AffiliateNetwork): void {
  registry.delete(network);
}

export function clearAffiliateNetworkAdapters(): void {
  registry.clear();
}

export function getAffiliateNetworkAdapter(network: AffiliateNetwork): AffiliateNetworkAdapter {
  return registry.get(network) ?? createNotConnectedAdapter(network);
}

export function listConnectedAffiliateNetworks(): AffiliateNetwork[] {
  return [...registry.entries()]
    .filter(([, a]) => a.connected)
    .map(([n]) => n as AffiliateNetwork);
}

export function isAnyAffiliateNetworkConnected(): boolean {
  return listConnectedAffiliateNetworks().length > 0;
}

export function resolveNetworkConnectionStatus(opts: {
  hasAnyConnectedAdapter: boolean;
  conversionCount: number;
  commissionCount: number;
}): 'not_connected' | 'connected_zero' | 'connected_with_data' {
  if (!opts.hasAnyConnectedAdapter) return 'not_connected';
  if (opts.conversionCount + opts.commissionCount > 0) return 'connected_with_data';
  return 'connected_zero';
}

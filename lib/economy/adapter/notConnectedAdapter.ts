/**
 * Fail-closed adapter when no live network is wired.
 * Never accepts payloads. Never invents commissions.
 */

import type { AffiliateNetwork } from '../types';
import type {
  AdapterParseResult,
  AffiliateNetworkAdapter,
  SignatureVerificationResult,
} from './types';

export function createNotConnectedAdapter(
  network: AffiliateNetwork = 'other',
): AffiliateNetworkAdapter {
  return {
    network,
    providerId: 'not_connected',
    connected: false,
    async verifySignature(): Promise<SignatureVerificationResult> {
      return {
        ok: false,
        reason: 'No affiliate network adapter connected',
        code: 'network_not_connected',
      };
    },
    parsePayload(): AdapterParseResult {
      return {
        ok: false,
        error: 'No affiliate network adapter connected — refuse parse',
        code: 'network_not_connected',
      };
    },
  };
}

export const DEFAULT_NOT_CONNECTED_ADAPTER = createNotConnectedAdapter('other');

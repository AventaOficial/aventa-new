/**
 * Signature verification boundary.
 * HTTP → verifyNetworkSignature → adapter.parse → normalize → persist
 *
 * Production default: FAIL CLOSED (no network selected).
 * Never invent algorithms/headers for an unknown provider.
 */

import type { AffiliateNetwork } from '../types';
import { getAffiliateNetworkAdapter } from './registry';
import type { SignatureVerificationInput, SignatureVerificationResult } from './types';

export async function verifyNetworkSignature(
  input: SignatureVerificationInput,
): Promise<SignatureVerificationResult> {
  const network = input.network;
  if (!network) {
    return { ok: false, reason: 'Missing network', code: 'missing_network' };
  }

  const rawLen =
    typeof input.rawBody === 'string'
      ? input.rawBody.length
      : input.rawBody?.byteLength ?? 0;
  if (rawLen <= 0) {
    return { ok: false, reason: 'Empty body', code: 'empty_body' };
  }

  const adapter = getAffiliateNetworkAdapter(network);
  if (!adapter.connected) {
    return {
      ok: false,
      reason: 'Affiliate network not connected — signature verification refused',
      code: 'network_not_connected',
    };
  }

  return adapter.verifySignature(input);
}

/** Explicit deny for any attempt to bypass signature before adapter work. */
export function assertSignatureVerified(
  result: SignatureVerificationResult,
): asserts result is { ok: true } {
  if (!result.ok) {
    throw new Error(`signature_verification_failed:${result.code}`);
  }
}

export function networkFromHeaderHints(
  headers: Record<string, string | string[] | undefined>,
): AffiliateNetwork | null {
  const raw = headers['x-aventa-network'] ?? headers['X-Aventa-Network'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const allowed = [
    'amazon',
    'mercadolibre',
    'aliexpress',
    'temu',
    'walmart',
    'shein',
    'other',
  ] as const;
  return (allowed as readonly string[]).includes(value)
    ? (value as AffiliateNetwork)
    : null;
}

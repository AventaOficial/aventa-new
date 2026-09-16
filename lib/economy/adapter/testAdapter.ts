/**
 * Test-only adapter with deterministic HMAC-like signature gate.
 * NOT registered in production. Used solely by tests/economy.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AffiliateNetwork } from '../types';
import {
  isNonNegativeIntegerCents,
  isValidCurrencyCode,
  normalizeCurrency,
} from './validateNormalized';
import type {
  AdapterParseResult,
  AffiliateNetworkAdapter,
  NormalizedCommission,
  NormalizedConversion,
  NormalizedCommissionRevision,
  SignatureVerificationInput,
  SignatureVerificationResult,
} from './types';

export const TEST_ADAPTER_SECRET = 'aventa-test-adapter-secret';

export function signTestPayload(rawBody: string, secret = TEST_ADAPTER_SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function createTestAffiliateNetworkAdapter(
  network: AffiliateNetwork = 'amazon',
): AffiliateNetworkAdapter {
  return {
    network,
    providerId: 'test_harness',
    connected: true,
    async verifySignature(input: SignatureVerificationInput): Promise<SignatureVerificationResult> {
      const header = input.headers['x-aventa-test-signature'] ?? input.headers['X-Aventa-Test-Signature'];
      const provided = Array.isArray(header) ? header[0] : header;
      if (!provided) {
        return { ok: false, reason: 'Missing signature header', code: 'missing_signature' };
      }
      const body =
        typeof input.rawBody === 'string'
          ? input.rawBody
          : Buffer.from(input.rawBody).toString('utf8');
      const expected = signTestPayload(body);
      try {
        const a = Buffer.from(provided, 'utf8');
        const b = Buffer.from(expected, 'utf8');
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return { ok: false, reason: 'Invalid signature', code: 'invalid_signature' };
        }
      } catch {
        return { ok: false, reason: 'Invalid signature', code: 'invalid_signature' };
      }
      return { ok: true };
    },
    parsePayload(payload: unknown): AdapterParseResult {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'malformed payload', code: 'malformed_event' };
      }
      const p = payload as Record<string, unknown>;
      const conversions: NormalizedConversion[] = [];
      const commissions: NormalizedCommission[] = [];
      const revisions: NormalizedCommissionRevision[] = [];

      const convList = Array.isArray(p.conversions) ? p.conversions : [];
      for (const raw of convList) {
        if (!raw || typeof raw !== 'object') {
          return { ok: false, error: 'malformed conversion', code: 'malformed_event' };
        }
        const c = raw as Record<string, unknown>;
        const externalConversionId = String(c.externalConversionId ?? '').trim();
        if (!externalConversionId) {
          return { ok: false, error: 'missing external conversion id', code: 'missing_external_id' };
        }
        conversions.push({
          source: 'webhook',
          network,
          externalConversionId,
          occurredAt: String(c.occurredAt ?? new Date().toISOString()),
          status: (c.status as NormalizedConversion['status']) ?? 'received',
          clickId: c.clickId ? String(c.clickId) : null,
          offerId: c.offerId ? String(c.offerId) : null,
          orderAmountCents:
            typeof c.orderAmountCents === 'number' ? c.orderAmountCents : null,
          currency: c.currency ? normalizeCurrency(String(c.currency)) : null,
          rawReference: {},
        });
      }

      const commList = Array.isArray(p.commissions) ? p.commissions : [];
      for (const raw of commList) {
        if (!raw || typeof raw !== 'object') {
          return { ok: false, error: 'malformed commission', code: 'malformed_event' };
        }
        const m = raw as Record<string, unknown>;
        const externalCommissionId = String(m.externalCommissionId ?? '').trim();
        const externalConversionId = String(m.externalConversionId ?? '').trim();
        if (!externalCommissionId || !externalConversionId) {
          return { ok: false, error: 'missing external id', code: 'missing_external_id' };
        }
        if (!isNonNegativeIntegerCents(m.grossCommissionCents)) {
          return { ok: false, error: 'invalid amount', code: 'invalid_amount' };
        }
        const currency = normalizeCurrency(String(m.currency ?? ''));
        if (!currency || !isValidCurrencyCode(currency)) {
          return { ok: false, error: 'invalid currency', code: 'invalid_currency' };
        }
        commissions.push({
          source: 'webhook',
          network,
          externalCommissionId,
          externalConversionId,
          occurredAt: String(m.occurredAt ?? new Date().toISOString()),
          status: (m.status as NormalizedCommission['status']) ?? 'reported',
          grossCommissionCents: m.grossCommissionCents,
          currency,
          rawReference: {},
        });
      }

      const revList = Array.isArray(p.revisions) ? p.revisions : [];
      for (const raw of revList) {
        if (!raw || typeof raw !== 'object') {
          return { ok: false, error: 'malformed revision', code: 'malformed_event' };
        }
        const r = raw as Record<string, unknown>;
        const externalRevisionId = String(r.externalRevisionId ?? '').trim();
        const externalCommissionId = String(r.externalCommissionId ?? '').trim();
        if (!externalRevisionId || !externalCommissionId) {
          return { ok: false, error: 'missing revision id', code: 'missing_external_id' };
        }
        const currency = normalizeCurrency(String(r.currency ?? ''));
        if (!currency) {
          return { ok: false, error: 'invalid currency', code: 'invalid_currency' };
        }
        revisions.push({
          source: 'webhook',
          network,
          externalRevisionId,
          externalCommissionId,
          occurredAt: String(r.occurredAt ?? new Date().toISOString()),
          revisionKind: r.revisionKind as NormalizedCommissionRevision['revisionKind'],
          semantics: r.semantics as NormalizedCommissionRevision['semantics'],
          amountDeltaCents:
            typeof r.amountDeltaCents === 'number' ? r.amountDeltaCents : null,
          absoluteAmountCents:
            typeof r.absoluteAmountCents === 'number' ? r.absoluteAmountCents : null,
          currency,
          reason: r.reason ? String(r.reason) : null,
          rawReference: {},
        });
      }

      return {
        ok: true,
        batch: { network, source: 'webhook', conversions, commissions, revisions },
      };
    },
  };
}

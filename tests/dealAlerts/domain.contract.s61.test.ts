/**
 * S6.1 — Deal Alerts domain contract tests.
 * Architecture proofs — no DDL, delivery, cron, LLM, or money writes.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { OpportunityEvaluation, OpportunityEvidence } from '@/lib/supply/intelligence/types';
import {
  DEAL_ALERTS_CONTRACT_VERSION,
  DEAL_ALERTS_FORBIDDEN_IMPORT_PATTERNS,
  DEAL_ALERTS_LLM_AS_AUTHORITY,
  DEAL_ALERTS_SUBSCRIPTION_CAPS,
  ALERT_SUBSCRIPTION_NEVER_IMPLIES_USER_SCRAPE,
  assertDealAlertsMoneyUntouched,
  buildDealAlertsDealDetected,
  buildDealAlertsIdempotencyKey,
  evaluateAlertability,
  evaluateAlertDecision,
  evidenceStrongEnoughForAlerts,
  idempotencyKeyIsUserAgnostic,
  validateAlertSubscription,
} from '@/lib/dealAlerts';
import { buildExactIdentity, buildUnknownIdentity } from '@/lib/dealIntelligence/identity';

function makeEvidence(
  overrides: Partial<OpportunityEvidence> & {
    evidenceLevel: OpportunityEvidence['evidenceLevel'];
    historyReady: boolean;
  },
): OpportunityEvidence {
  return {
    salePrice: {
      amount: 500,
      kind: 'api_quote',
      source: 'mercadolibre',
      observedAt: new Date().toISOString(),
      trusted: true,
    },
    referencePrice: {
      amount: 1000,
      kind: 'history_low',
      source: 'price_memory',
      observedAt: new Date().toISOString(),
      trusted: true,
    },
    discountPercent: 50,
    evidenceLevel: overrides.evidenceLevel,
    historyReady: overrides.historyReady,
    suspectedArtificialListPrice: false,
    hasImage: true,
    productFingerprint: overrides.productFingerprint ?? 'ml:MLM123',
    signals: {},
    ...overrides,
  };
}

function makeEvaluation(
  decision: OpportunityEvaluation['decision'],
  evidence: OpportunityEvidence,
): OpportunityEvaluation {
  return {
    candidateUrl: 'https://www.mercadolibre.com.mx/item/MLM123',
    productFingerprint: evidence.productFingerprint,
    decision,
    score: {
      value: decision === 'OPPORTUNITY' ? 80 : 20,
      confidence: 0.8,
      reasonCodes: [],
      breakdown: {
        priceEvidence: 0.3,
        discountMagnitude: 0.3,
        historySupport: 0.2,
        qualitySignals: 0.15,
      },
    },
    evidence,
    evaluatedAt: new Date().toISOString(),
    dryRun: false,
    adapterNotes: [],
  };
}

describe('S6.1 alertability', () => {
  it('1 — OPPORTUNITY + historyReady + history_backed → alertable', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.alertable).toBe(true);
    expect(a.blockReason).toBeNull();
    expect(a.contractVersion).toBe(DEAL_ALERTS_CONTRACT_VERSION);
  });

  it('2 — OPPORTUNITY without historyReady → insufficient evidence', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'api_verified', historyReady: false }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.alertable).toBe(false);
    expect(a.blockReason).toBe('insufficient_evidence');
    const d = evaluateAlertDecision({ alertability: a });
    expect(d.result).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('3 — weak evidence → insufficient', () => {
    expect(evidenceStrongEnoughForAlerts('weak_card', true)).toBe(false);
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'weak_card', historyReady: true }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
      evidenceStrength: 'WEAK',
    });
    expect(a.alertable).toBe(false);
    expect(a.blockReason).toBe('weak_evidence');
  });

  it('4 — stale evidence → STALE', () => {
    const old = new Date(Date.now() - 48 * 3600_000).toISOString();
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: old,
      now: new Date(),
      maxAgeSeconds: 86_400,
    });
    expect(a.stale).toBe(true);
    expect(a.blockReason).toBe('stale');
    expect(evaluateAlertDecision({ alertability: a }).result).toBe('STALE');
  });

  it('5 — missing fingerprint → fail-closed', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({
        evidenceLevel: 'history_backed',
        historyReady: true,
        productFingerprint: null,
      }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.alertable).toBe(false);
    expect(a.blockReason).toBe('missing_fingerprint');
  });

  it('6 — missing identity (unknown) → fail-closed', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      identityStatus: 'unknown',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.alertable).toBe(false);
    expect(a.blockReason).toBe('missing_identity');
  });

  it('7 — non-opportunity → SUPPRESS', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'REJECT',
      evidence: makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.alertable).toBe(false);
    expect(evaluateAlertDecision({ alertability: a }).result).toBe('SUPPRESS');
  });
});

describe('S6.1 idempotency', () => {
  const identity = buildExactIdentity({
    merchant: 'mercadolibre',
    mlItemId: 'MLM999',
    productFingerprint: 'ml:MLM999',
  });

  it('8/9 — deterministic same input → same key', () => {
    const input = {
      sourceId: 'hunter',
      identity,
      observedAt: '2026-09-19T12:00:00.000Z',
      salePrice: 499,
    };
    expect(buildDealAlertsIdempotencyKey(input)).toBe(buildDealAlertsIdempotencyKey(input));
  });

  it('10 — different fingerprint → different key', () => {
    const a = buildDealAlertsIdempotencyKey({
      sourceId: 'hunter',
      identity,
      observedAt: '2026-09-19T12:00:00.000Z',
      salePrice: 499,
    });
    const b = buildDealAlertsIdempotencyKey({
      sourceId: 'hunter',
      identity: buildExactIdentity({
        merchant: 'mercadolibre',
        mlItemId: 'MLM888',
        productFingerprint: 'ml:MLM888',
      }),
      observedAt: '2026-09-19T12:00:00.000Z',
      salePrice: 499,
    });
    expect(a).not.toBe(b);
  });

  it('11 — userId never in global DealDetected identity', () => {
    const userId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const key = buildDealAlertsIdempotencyKey({
      sourceId: 'hunter',
      identity,
      observedAt: '2026-09-19T12:00:00.000Z',
      salePrice: 499,
    });
    expect(idempotencyKeyIsUserAgnostic(key, userId)).toBe(true);
    const event = buildDealAlertsDealDetected({
      evaluation: makeEvaluation(
        'OPPORTUNITY',
        makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      ),
    });
    expect(event.userScoped).toBe(false);
    expect(JSON.stringify(event)).not.toContain(userId);
    expect(event.idempotencyKey.startsWith('da:')).toBe(true);
  });
});

describe('S6.1 subscription caps + decision contract', () => {
  it('12 — subscription caps contract', () => {
    expect(ALERT_SUBSCRIPTION_NEVER_IMPLIES_USER_SCRAPE).toBe(true);
    const ok = validateAlertSubscription({
      userId: 'u1',
      stores: ['mercadolibre', 'amazon'],
      categories: ['tecnologia'],
      minimumDiscountPercent: 40,
      notificationChannels: ['in_app'],
      enabled: true,
      cooldownSeconds: DEAL_ALERTS_SUBSCRIPTION_CAPS.defaultCooldownSeconds,
      dailyCap: 5,
    });
    expect(ok.ok).toBe(true);

    const bad = validateAlertSubscription({
      userId: 'u1',
      stores: Array.from({ length: 20 }, (_, i) => `s${i}`),
      categories: [],
      minimumDiscountPercent: 5,
      notificationChannels: [],
      enabled: true,
      cooldownSeconds: 10,
      dailyCap: 999,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.violations).toContain('too_many_stores');
      expect(bad.violations).toContain('discount_below_minimum');
      expect(bad.violations).toContain('empty_channels');
    }
  });

  it('decision outcomes: DUPLICATE / NOT_RELEVANT / RATE_LIMITED / MATCH', () => {
    const alertable = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({ evidenceLevel: 'history_backed', historyReady: true }),
      identityStatus: 'exact',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(evaluateAlertDecision({ alertability: alertable }).result).toBe('MATCH');
    expect(
      evaluateAlertDecision({ alertability: alertable, duplicateOfExisting: true }).result,
    ).toBe('DUPLICATE');
    expect(
      evaluateAlertDecision({ alertability: alertable, relevantToCriteria: false }).result,
    ).toBe('NOT_RELEVANT');
    expect(evaluateAlertDecision({ alertability: alertable, rateLimited: true }).result).toBe(
      'RATE_LIMITED',
    );
  });
});

describe('S6.1 safety / version / isolation', () => {
  it('13 — money-path isolation', () => {
    const r = assertDealAlertsMoneyUntouched();
    expect(r.ok).toBe(true);
    expect(r.dealAlerts.moneyPathRequired).toBe(false);
    expect(r.dealAlerts.writesPayouts).toBe(false);
  });

  it('14 — contract version present', () => {
    const a = evaluateAlertability({
      opportunityDecision: 'PARTIAL',
      evidence: makeEvidence({ evidenceLevel: 'none', historyReady: false, productFingerprint: null }),
      identityStatus: 'unknown',
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.contractVersion).toBe('deal-alerts.v1');
    const d = evaluateAlertDecision({ alertability: a });
    expect(d.contractVersion).toBe('deal-alerts.v1');
  });

  it('15 — no LLM dependency + forbidden money imports', () => {
    expect(DEAL_ALERTS_LLM_AS_AUTHORITY).toBe(false);
    const root = join(process.cwd(), 'lib/dealAlerts');
    const files = readdirSync(root).filter((f) => f.endsWith('.ts'));
    const importRe =
      /from\s+['"]@\/lib\/(rewards|economy\/settlement|economy\/record|attribution\/record|commissions)\b/;
    for (const f of files) {
      const full = join(root, f);
      if (!statSync(full).isFile()) continue;
      const src = readFileSync(full, 'utf8');
      expect(src).not.toMatch(/openai|anthropic|@ai-sdk|createOpenAI|generateText/i);
      expect(src).not.toMatch(importRe);
    }
    // Catalog of forbidden paths exists for documentation / future guards
    expect(DEAL_ALERTS_FORBIDDEN_IMPORT_PATTERNS.length).toBeGreaterThan(0);
  });

  it('unknown identity helper still fail-closed when fingerprint present but status unknown', () => {
    const unk = buildUnknownIdentity({ productFingerprint: 'ml:X' });
    expect(unk.identityStatus).toBe('unknown');
    const a = evaluateAlertability({
      opportunityDecision: 'OPPORTUNITY',
      evidence: makeEvidence({
        evidenceLevel: 'history_backed',
        historyReady: true,
        productFingerprint: 'ml:X',
      }),
      identityStatus: unk.identityStatus,
      sourceId: 'src',
      observedAt: new Date().toISOString(),
    });
    expect(a.blockReason).toBe('missing_identity');
  });
});

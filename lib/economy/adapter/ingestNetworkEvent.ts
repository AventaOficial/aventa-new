/**
 * Server-only ingest pipeline:
 * signature → adapter.parse → recordConversion/Commission/Revision
 *
 * NO public webhook route in this phase.
 * NO settlement / rewards / payouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordCommission } from '../recordCommission';
import { recordConversion } from '../recordConversion';
import { recordCommissionRevision } from '../revisions/recordCommissionRevision';
import type { AffiliateNetwork, EconomicIngestSource } from '../types';
import { getAffiliateNetworkAdapter } from './registry';
import { boundRawReference } from './validateNormalized';
import { assertSignatureVerified, verifyNetworkSignature } from './verifyNetworkSignature';
import type { NormalizedNetworkBatch, SignatureVerificationInput } from './types';

export type IngestNetworkEventResult =
  | {
      ok: true;
      network: AffiliateNetwork;
      conversions: number;
      commissions: number;
      revisions: number;
      reused: number;
    }
  | { ok: false; error: string; code: string };

/**
 * Persist a pre-normalized batch (e.g. CSV import / reconciliation fixture).
 * Still refuses settlement. Does not verify HTTP signatures (caller already trusted).
 */
export async function persistNormalizedBatch(
  supabase: SupabaseClient,
  batch: NormalizedNetworkBatch,
  opts?: { actor?: string },
): Promise<IngestNetworkEventResult> {
  let conversions = 0;
  let commissions = 0;
  let revisions = 0;
  let reused = 0;

  const conversionIdByExternal = new Map<string, string>();

  for (const c of batch.conversions) {
    const row = await recordConversion(supabase, {
      source: c.source,
      network: c.network,
      externalConversionId: c.externalConversionId,
      occurredAt: c.occurredAt,
      clickId: c.clickId,
      offerId: c.offerId,
      status: c.status,
      orderAmountCents: c.orderAmountCents,
      currency: c.currency,
      rawReference: boundRawReference(c.rawReference),
      actor: opts?.actor ?? 'adapter',
    });
    if (!row) {
      return { ok: false, error: 'conversion_persist_failed', code: 'persist_failed' };
    }
    conversionIdByExternal.set(c.externalConversionId, row.conversionId);
    conversions += 1;
    if (row.reused) reused += 1;
  }

  for (const m of batch.commissions) {
    let conversionId = conversionIdByExternal.get(m.externalConversionId) ?? null;
    if (!conversionId) {
      const { data } = await supabase
        .from('affiliate_conversions')
        .select('id')
        .eq('source', m.source)
        .eq('network', m.network)
        .eq('external_conversion_id', m.externalConversionId)
        .maybeSingle();
      conversionId = data?.id ? String(data.id) : null;
    }
    if (!conversionId) {
      return {
        ok: false,
        error: `commission missing conversion ${m.externalConversionId}`,
        code: 'orphan_commission',
      };
    }
    const row = await recordCommission(supabase, {
      conversionId,
      source: m.source,
      network: m.network,
      externalCommissionId: m.externalCommissionId,
      grossCommissionCents: m.grossCommissionCents,
      currency: m.currency,
      occurredAt: m.occurredAt,
      status: m.status,
      rawReference: boundRawReference(m.rawReference),
      actor: opts?.actor ?? 'adapter',
    });
    if (!row) {
      return { ok: false, error: 'commission_persist_failed', code: 'persist_failed' };
    }
    commissions += 1;
    if (row.reused) reused += 1;
  }

  for (const r of batch.revisions) {
    const { data: commission } = await supabase
      .from('affiliate_commissions')
      .select('id')
      .eq('source', r.source)
      .eq('network', r.network)
      .eq('external_commission_id', r.externalCommissionId)
      .maybeSingle();
    if (!commission?.id) {
      return {
        ok: false,
        error: `revision missing commission ${r.externalCommissionId}`,
        code: 'orphan_revision',
      };
    }
    const row = await recordCommissionRevision(supabase, {
      commissionId: String(commission.id),
      source: r.source,
      network: r.network,
      externalRevisionId: r.externalRevisionId,
      revisionKind: r.revisionKind,
      semantics: r.semantics,
      amountDeltaCents: r.amountDeltaCents,
      absoluteAmountCents: r.absoluteAmountCents,
      currency: r.currency,
      reason: r.reason,
      occurredAt: r.occurredAt,
      rawReference: boundRawReference(r.rawReference),
      actor: opts?.actor ?? 'adapter',
    });
    if (!row) {
      return { ok: false, error: 'revision_persist_failed', code: 'persist_failed' };
    }
    revisions += 1;
    if (row.reused) reused += 1;
  }

  return {
    ok: true,
    network: batch.network,
    conversions,
    commissions,
    revisions,
    reused,
  };
}

/**
 * Full fail-closed HTTP-shaped ingest. Without a connected adapter + valid signature → refuse.
 */
export async function ingestNetworkHttpEvent(
  supabase: SupabaseClient,
  input: {
    network: AffiliateNetwork;
    source?: EconomicIngestSource;
    headers: SignatureVerificationInput['headers'];
    rawBody: string | Uint8Array;
    payload: unknown;
    actor?: string;
  },
): Promise<IngestNetworkEventResult> {
  const sig = await verifyNetworkSignature({
    network: input.network,
    headers: input.headers,
    rawBody: input.rawBody,
  });
  try {
    assertSignatureVerified(sig);
  } catch {
    return {
      ok: false,
      error: sig.ok ? 'signature_failed' : sig.reason,
      code: sig.ok ? 'signature_failed' : sig.code,
    };
  }

  const adapter = getAffiliateNetworkAdapter(input.network);
  if (!adapter.connected) {
    return { ok: false, error: 'network_not_connected', code: 'network_not_connected' };
  }

  const parsed = adapter.parsePayload(input.payload);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, code: parsed.code };
  }

  // Source override only if adapter omitted — never from untrusted client fields alone.
  const batch = {
    ...parsed.batch,
    source: input.source ?? parsed.batch.source,
  };

  return persistNormalizedBatch(supabase, batch, { actor: input.actor ?? 'webhook' });
}

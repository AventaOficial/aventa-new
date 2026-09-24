/**
 * Thin facade for staff batch helpers.
 * Sole persistence: ingestOfferObservation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';

export type CreateCommunityOfferOk = { ok: true; id: string; status: 'pending' };
export type CreateCommunityOfferFail = {
  ok: false;
  httpStatus: 400 | 409 | 500;
  error: string;
  duplicate_offer_id?: string | null;
  duplicate_status?: string | null;
  issues?: Array<{ path: string; message: string }>;
};
export type CreateCommunityOfferResult = CreateCommunityOfferOk | CreateCommunityOfferFail;

/**
 * Staff/batch pending create. Always pending. No publish.
 * @deprecated Prefer ingestOfferObservation directly; kept as adapter.
 */
export async function createCommunityOfferPending(params: {
  supabase: SupabaseClient;
  createdBy: string;
  body: unknown;
  sourceDetail?: string;
}): Promise<CreateCommunityOfferResult> {
  const result = await ingestOfferObservation(params.supabase, {
    createdBy: params.createdBy,
    source: params.sourceDetail ?? 'community:batch',
    body: params.body,
    onDuplicate: 'reuse',
    forceLoteTag: true,
    allowMissingUrl: false,
  });

  if (!result.ok) {
    return {
      ok: false,
      httpStatus: result.httpStatus,
      error: result.error,
      duplicate_offer_id: result.duplicate_offer_id ?? null,
      duplicate_status: result.duplicate_status ?? null,
      issues: result.issues,
    };
  }

  return { ok: true, id: result.offerId, status: 'pending' };
}

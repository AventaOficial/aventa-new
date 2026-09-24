import { NextResponse } from 'next/server';
import { getClientIp, enforceRateLimitCustom } from '@/lib/server/rateLimit';
import { resolveOfferAutoApproveForUser } from '@/lib/server/offerAutoApprove';
import {
  communityPersistStatus,
  evaluateCommunitySubmission,
  persistCommunitySupplyRun,
  recordCommunityDuplicateOnly,
  recordCommunityInvalidUrl,
  type CommunityQualityEvaluation,
} from '@/lib/hunter/supply';
import { createOfferInputSchema } from '@/lib/contracts/offers';
import {
  requireBearerCommunityUser,
  communityAuthFailureResponse,
} from '@/lib/server/requireCommunityUser';
import { getUploadCooldownStatus } from '@/lib/server/uploadCooldown';
import { evaluateAbusePolicy } from '@/lib/abuse/risk';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { recordShadowOutcomeFromAutonomous } from '@/lib/autonomous';
import { createServerClient } from '@/lib/supabase/server';
import { ingestOfferObservation } from '@/lib/offers/ingestion/ingestOfferObservation';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';

/**
 * Community public create. Always pending. No auto-publish.
 * Persistence goes solely through ingestOfferObservation.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rl = await enforceRateLimitCustom(ip, 'offers');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Demasiadas ofertas. Espera un minuto antes de subir otra.', code: rl.code },
        { status: rl.status },
      );
    }

    const authResult = await requireBearerCommunityUser(request);
    if ('error' in authResult) {
      return communityAuthFailureResponse(authResult);
    }
    const { user, supabase: userClient } = authResult;
    const createdBy = user.id;
    const abuse = evaluateAbusePolicy({
      action: 'submission',
      accountCreatedAt: user.created_at,
    });
    if (!abuse.allow) {
      return NextResponse.json({ error: abuse.message, code: abuse.code }, { status: 403 });
    }

    const cooldown = await getUploadCooldownStatus(userClient, user);
    if (!cooldown.canUpload) {
      return NextResponse.json(
        {
          error: `Espera ${cooldown.remainingSeconds}s antes de publicar otra oferta.`,
          remainingSeconds: cooldown.remainingSeconds,
        },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createOfferInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Datos inválidos para crear oferta',
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    let reputation = null;
    try {
      reputation = await resolveOfferAutoApproveForUser(userClient, createdBy);
    } catch {
      reputation = null;
    }

    const hasDiscount = input.hasDiscount !== false;
    const originalPrice = hasDiscount && input.original_price != null ? input.original_price : null;
    const price = input.price ?? originalPrice ?? 0;
    const imageUrlRaw = typeof input.image_url === 'string' ? input.image_url.trim() : '';
    const rawOfferUrl = typeof input.offer_url === 'string' ? input.offer_url.trim() : '';

    const communityStartedAt = new Date().toISOString();
    let quality: CommunityQualityEvaluation | null = null;
    try {
      quality = evaluateCommunitySubmission(
        {
          title: input.title.trim(),
          store: input.store.trim(),
          price,
          originalPrice: hasDiscount && originalPrice != null ? originalPrice : null,
          imageUrl: imageUrlRaw && imageUrlRaw !== '/placeholder.png' ? imageUrlRaw : null,
          offerUrl: rawOfferUrl || null,
          description: typeof input.description === 'string' ? input.description : null,
          coupons: typeof input.coupons === 'string' ? input.coupons : null,
        },
        { reputation },
      );
    } catch {
      quality = null;
    }
    const offerStatus = quality ? communityPersistStatus(quality) : 'pending';

    // Service role for observation writes (RLS); createdBy stays the authenticated user.
    const result = await ingestOfferObservation(createServerClient(), {
      createdBy,
      source: 'community:paste',
      body: input,
      onDuplicate: 'reject',
      allowMissingUrl: true,
      forceLoteTag: false,
      recordSubmissionCount: true,
      recordPriceSnapshot: true,
      extractionMethod: 'community_paste',
    });

    if (!result.ok) {
      if (result.httpStatus === 409) {
        recordCommunityDuplicateOnly();
        void persistCommunitySupplyRun({
          runId: `community:dup:${result.duplicate_offer_id ?? 'unknown'}`,
          startedAt: communityStartedAt,
          evaluation: quality,
          duplicate: true,
        });
      } else if (result.httpStatus === 400 && rawOfferUrl) {
        const urlCheck = validatePublicOfferUrl(rawOfferUrl);
        if (!urlCheck.ok) recordCommunityInvalidUrl();
      }
      return NextResponse.json(
        {
          error: result.error,
          ...(result.issues ? { issues: result.issues } : {}),
          ...(result.duplicate_offer_id != null
            ? {
                duplicate_offer_id: result.duplicate_offer_id,
                duplicate_status: result.duplicate_status,
              }
            : {}),
        },
        { status: result.httpStatus },
      );
    }

    void persistCommunitySupplyRun({
      runId: `community:${result.offerId}`,
      startedAt: communityStartedAt,
      evaluation: quality,
      insertedPending: offerStatus === 'pending',
    });

    if (quality?.autonomousResult) {
      const fp = result.identityKey?.startsWith('amz:') || result.identityKey?.startsWith('ml:')
        ? result.identityKey
        : rawOfferUrl
          ? resolveIngestionIdentity(rawOfferUrl).productFingerprint
          : null;
      void recordShadowOutcomeFromAutonomous({
        offerId: result.offerId,
        result: quality.autonomousResult,
        sourceId: 'community',
        sourceFamily: 'community',
        sourceDetail: 'community:paste',
        fingerprint: fp,
        qualification: quality.qualification,
        creatorId: createdBy,
      });
    }

    void recordProductEvent({
      event: 'submission',
      userId: createdBy,
      offerId: result.offerId,
      source: 'api/offers',
    });

    // Productive status remains pending (communityPersistStatus is advisory telemetry only).
    return NextResponse.json({ id: result.offerId, ok: true, status: 'pending' });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[offers] error:', err.message, e);
    const devMessage = process.env.NODE_ENV === 'development' ? err.message : undefined;
    return NextResponse.json(
      { error: 'Error al crear la oferta', ...(devMessage && { details: devMessage }) },
      { status: 500 },
    );
  }
}

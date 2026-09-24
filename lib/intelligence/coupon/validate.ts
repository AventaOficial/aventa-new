import { FRESHNESS_STALE_AFTER_MS } from '@/lib/offers/freshness/policy';
import type { CouponLifecycle, CouponSnapshot } from '@/lib/intelligence/coupon/types';

export type CouponPublicLabel =
  | 'VERIFICADO'
  | 'DISPONIBLE'
  | 'POR VERIFICAR'
  | 'PRÓXIMO A EXPIRAR'
  | 'EXPIRADO'
  | 'NO DISPONIBLE'
  | 'CONDICIONES ESPECIALES';

const EXPIRY_URGENCY_MS = 48 * 60 * 60 * 1000;

export function classifyCoupon(input: CouponSnapshot, now: Date): {
  status: CouponLifecycle;
  publicLabel: CouponPublicLabel;
  showAsAvailable: boolean;
  freshnessHours: number | null;
  stale: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const expiresMs = input.expiresAt ? Date.parse(input.expiresAt) : null;
  const expired = expiresMs != null && Number.isFinite(expiresMs) && expiresMs < now.getTime();
  if (input.status === 'invalid' || input.verificationStatus === 'failed') {
    return {
      status: 'invalid',
      publicLabel: 'NO DISPONIBLE',
      showAsAvailable: false,
      freshnessHours: null,
      stale: false,
      reasons: ['verification_failed'],
    };
  }
  if (expired || input.status === 'expired') {
    return {
      status: 'expired',
      publicLabel: 'EXPIRADO',
      showAsAvailable: false,
      freshnessHours: null,
      stale: true,
      reasons: ['past_expires_at'],
    };
  }

  const verifiedAt = input.lastVerifiedAt ? Date.parse(input.lastVerifiedAt) : null;
  const freshnessHours =
    verifiedAt != null && Number.isFinite(verifiedAt)
      ? Math.round(((now.getTime() - verifiedAt) / (60 * 60 * 1000)) * 100) / 100
      : null;
  const stale = freshnessHours == null || freshnessHours * 60 * 60 * 1000 > FRESHNESS_STALE_AFTER_MS;
  const verified = input.verificationStatus === 'verified' && input.status === 'verified';
  const soon =
    expiresMs != null && expiresMs - now.getTime() <= EXPIRY_URGENCY_MS && expiresMs >= now.getTime();
  const special = input.appliesTo !== 'store' || Boolean(input.restrictions?.trim());

  if (!verified) {
    reasons.push('mention_is_not_verification');
    return {
      status: input.status === 'discovered' ? 'discovered' : 'unverified',
      publicLabel: 'POR VERIFICAR',
      showAsAvailable: false,
      freshnessHours,
      stale,
      reasons,
    };
  }
  if (stale) {
    reasons.push('verification_older_than_freshness_window');
    return {
      status: 'unverified',
      publicLabel: 'POR VERIFICAR',
      showAsAvailable: false,
      freshnessHours,
      stale: true,
      reasons,
    };
  }
  if (special) {
    return {
      status: 'verified',
      publicLabel: 'CONDICIONES ESPECIALES',
      showAsAvailable: true,
      freshnessHours,
      stale: false,
      reasons: ['scope_or_restriction_known'],
    };
  }
  if (soon) {
    return {
      status: 'verified',
      publicLabel: 'PRÓXIMO A EXPIRAR',
      showAsAvailable: true,
      freshnessHours,
      stale: false,
      reasons: ['expires_within_48h'],
    };
  }
  return {
    status: 'verified',
    publicLabel: 'VERIFICADO',
    showAsAvailable: true,
    freshnessHours,
    stale: false,
    reasons: ['verified_inside_freshness_window'],
  };
}

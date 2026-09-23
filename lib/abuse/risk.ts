/**
 * Central abuse policy. Velocity lives in rate limits; this layer adds deterministic account-age
 * and self-target rules. No ML, no captcha.
 */

export type AbuseAction = 'vote' | 'comment' | 'report' | 'submission' | 'outbound' | 'account_deletion';

const MIN_ACCOUNT_AGE_MS: Partial<Record<AbuseAction, number>> = {
  submission: 2 * 60 * 1000,
  comment: 60 * 1000,
  report: 60 * 1000,
};

export type AbuseDecision = {
  allow: boolean;
  code?: 'account_too_new' | 'self_target';
  message?: string;
};

export function evaluateAbusePolicy(input: {
  action: AbuseAction;
  accountCreatedAt?: string | null;
  now?: Date;
  isSelfTarget?: boolean;
}): AbuseDecision {
  if (input.action === 'report' && input.isSelfTarget) {
    return {
      allow: false,
      code: 'self_target',
      message: 'No puedes reportar tu propia oferta.',
    };
  }

  const minAge = MIN_ACCOUNT_AGE_MS[input.action];
  if (minAge && input.accountCreatedAt) {
    const created = new Date(input.accountCreatedAt).getTime();
    const now = (input.now ?? new Date()).getTime();
    if (Number.isFinite(created) && now - created < minAge) {
      return {
        allow: false,
        code: 'account_too_new',
        message: 'Tu cuenta es demasiado nueva para esta acción. Intenta de nuevo en unos minutos.',
      };
    }
  }

  return { allow: true };
}

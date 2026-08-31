export const SIGNUP_LEGAL_CONSENT_ERROR =
  'Debes aceptar los Términos y la Política de Privacidad para crear tu cuenta.';

export const SIGNUP_LEGAL_CONSENT_OAUTH_ERROR =
  'Debes aceptar los Términos y la Política de Privacidad para continuar.';

/** Bloquea registro por email si falta consentimiento (misma semántica que RegisterModal). */
export function validateSignupLegalConsent(legalConsent: boolean): string | null {
  if (!legalConsent) return SIGNUP_LEGAL_CONSENT_ERROR;
  return null;
}

/** Bloquea OAuth signup si falta consentimiento (misma semántica que RegisterModal). */
export function validateSignupLegalConsentForOAuth(legalConsent: boolean): string | null {
  if (!legalConsent) return SIGNUP_LEGAL_CONSENT_OAUTH_ERROR;
  return null;
}

export function isSignupSubmitDisabled(
  loading: boolean,
  mode: 'signup' | 'signin',
  legalConsent: boolean,
): boolean {
  return loading || (mode === 'signup' && !legalConsent);
}

export function isOAuthSignupDisabled(
  oauthLoading: boolean,
  mode: 'signup' | 'signin',
  legalConsent: boolean,
): boolean {
  return oauthLoading || (mode === 'signup' && !legalConsent);
}

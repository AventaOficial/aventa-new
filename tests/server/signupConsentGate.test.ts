import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateSignupLegalConsent,
  validateSignupLegalConsentForOAuth,
  isSignupSubmitDisabled,
  isOAuthSignupDisabled,
  SIGNUP_LEGAL_CONSENT_ERROR,
  SIGNUP_LEGAL_CONSENT_OAUTH_ERROR,
} from '../../lib/legal/signupConsentGate';
import {
  writePendingLegalConsent,
  readPendingLegalConsent,
  clearPendingLegalConsent,
} from '../../lib/legal/pendingConsent';
import { LEGAL_CONSENT_VERSION } from '../../lib/legal/constants';

describe('PageAuth signup consent gate', () => {
  it('email sin consentimiento → bloquea registro', () => {
    expect(validateSignupLegalConsent(false)).toBe(SIGNUP_LEGAL_CONSENT_ERROR);
    expect(isSignupSubmitDisabled(false, 'signup', false)).toBe(true);
  });

  it('email con ambos consentimientos → permite continuar', () => {
    expect(validateSignupLegalConsent(true)).toBeNull();
    expect(isSignupSubmitDisabled(false, 'signup', true)).toBe(false);
  });

  it('signin no exige consentimiento', () => {
    expect(validateSignupLegalConsent(false)).toBe(SIGNUP_LEGAL_CONSENT_ERROR);
    expect(isSignupSubmitDisabled(false, 'signin', false)).toBe(false);
    expect(isOAuthSignupDisabled(false, 'signin', false)).toBe(false);
  });

  it('Google OAuth signup sin consentimiento → bloquea', () => {
    expect(validateSignupLegalConsentForOAuth(false)).toBe(SIGNUP_LEGAL_CONSENT_OAUTH_ERROR);
    expect(isOAuthSignupDisabled(false, 'signup', false)).toBe(true);
  });

  it('Google OAuth signup con consentimiento → habilita redirect', () => {
    expect(validateSignupLegalConsentForOAuth(true)).toBeNull();
    expect(isOAuthSignupDisabled(false, 'signup', true)).toBe(false);
  });
});

describe('RegisterModal consent semantics (sin cambios de copy)', () => {
  it('mantiene los mismos mensajes de error que RegisterModal', () => {
    expect(SIGNUP_LEGAL_CONSENT_ERROR).toBe(
      'Debes aceptar los Términos y la Política de Privacidad para crear tu cuenta.',
    );
    expect(SIGNUP_LEGAL_CONSENT_OAUTH_ERROR).toBe(
      'Debes aceptar los Términos y la Política de Privacidad para continuar.',
    );
  });
});

describe('pending legal consent tras OAuth redirect', () => {
  let sessionStore: Map<string, string>;

  beforeEach(() => {
    sessionStore = new Map();
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
    });
    clearPendingLegalConsent();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('conserva consentimiento en sessionStorage después del redirect simulado', () => {
    writePendingLegalConsent();
    const beforeRedirect = readPendingLegalConsent();
    expect(beforeRedirect).not.toBeNull();
    expect(beforeRedirect?.termsAccepted).toBe(true);
    expect(beforeRedirect?.privacyAccepted).toBe(true);
    expect(beforeRedirect?.version).toBe(LEGAL_CONSENT_VERSION);

    const afterRedirect = readPendingLegalConsent();
    expect(afterRedirect).toEqual(beforeRedirect);
  });
});

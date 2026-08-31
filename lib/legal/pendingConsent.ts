import { LEGAL_CONSENT_VERSION, PENDING_LEGAL_CONSENT_KEY } from '@/lib/legal/constants';

type PendingLegalConsent = {
  termsAccepted: true;
  privacyAccepted: true;
  version: string;
  recordedAt: string;
};

/** Marca consentimiento pendiente antes de OAuth (se persiste tras login). */
export function writePendingLegalConsent(): void {
  if (typeof window === 'undefined') return;
  const payload: PendingLegalConsent = {
    termsAccepted: true,
    privacyAccepted: true,
    version: LEGAL_CONSENT_VERSION,
    recordedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(PENDING_LEGAL_CONSENT_KEY, JSON.stringify(payload));
}

export function readPendingLegalConsent(): PendingLegalConsent | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_LEGAL_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingLegalConsent;
    if (parsed?.termsAccepted && parsed?.privacyAccepted && parsed?.version) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingLegalConsent(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(PENDING_LEGAL_CONSENT_KEY);
}

import { LEGAL_CONSENT_VERSION } from '@/lib/legal/constants';

/** Persiste consentimiento legal server-side (requiere sesión activa). */
export async function recordLegalConsent(accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/me/legal-consent', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ version: LEGAL_CONSENT_VERSION }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: typeof body?.error === 'string' ? body.error : 'No se pudo registrar el consentimiento',
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Error de red al registrar consentimiento' };
  }
}

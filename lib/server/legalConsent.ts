import type { SupabaseClient } from '@supabase/supabase-js';
import { LEGAL_CONSENT_VERSION } from '@/lib/legal/constants';

export type LegalConsentCheck = true | false | 'missing_columns';

/** true = consentimiento vigente; false = falta; missing_columns = migración no aplicada. */
export async function hasCurrentLegalConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<LegalConsentCheck> {
  const { data, error } = await supabase
    .from('profiles')
    .select('terms_accepted_at, privacy_accepted_at, legal_consent_version')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? '';
    if (
      msg.includes('terms_accepted_at') ||
      msg.includes('legal_consent_version') ||
      error.code === 'PGRST204'
    ) {
      return 'missing_columns';
    }
    console.error('[legalConsent] read failed:', msg);
    return false;
  }

  const row = data as {
    terms_accepted_at?: string | null;
    privacy_accepted_at?: string | null;
    legal_consent_version?: string | null;
  } | null;

  if (
    row?.terms_accepted_at &&
    row?.privacy_accepted_at &&
    row?.legal_consent_version === LEGAL_CONSENT_VERSION
  ) {
    return true;
  }
  return false;
}

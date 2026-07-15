import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fiscalProfileFromRow,
  validateCommissionFiscal,
  type CommissionFiscalInput,
  type CommissionFiscalProfile,
} from '@/lib/commissions/fiscal';

function isMissingFiscalColumn(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST204' ||
    msg.includes('commission_rfc') ||
    msg.includes('commission_legal_name') ||
    msg.includes('schema cache')
  );
}

export async function getCommissionFiscalProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommissionFiscalProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return { legalName: null, rfc: null, clabe: null, updatedAt: null };
  }
  return fiscalProfileFromRow(data as Record<string, unknown>);
}

export async function findDuplicateRfcOwner(
  supabase: SupabaseClient,
  rfc: string,
  excludeUserId: string,
): Promise<string | null> {
  const normalized = rfc.trim().toUpperCase();
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('commission_rfc', normalized)
    .neq('id', excludeUserId)
    .maybeSingle();

  if (error) {
    if (isMissingFiscalColumn(error)) return null;
    console.error('[commissionFiscal] duplicate check', error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id ?? null;
}

export async function saveCommissionFiscalProfile(
  supabase: SupabaseClient,
  userId: string,
  input: CommissionFiscalInput,
): Promise<{ ok: true; fiscal: CommissionFiscalProfile } | { ok: false; error: string; needsMigration?: boolean }> {
  const validated = validateCommissionFiscal(input);
  if (!validated.ok || !validated.normalized) {
    return { ok: false, error: validated.error ?? 'Datos fiscales inválidos' };
  }

  const duplicateId = await findDuplicateRfcOwner(supabase, validated.normalized.rfc, userId);
  if (duplicateId) {
    return {
      ok: false,
      error: 'Este RFC ya está registrado en otra cuenta de AVENTA. Si es un error, escribe a soporte legal.',
    };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({
      commission_legal_name: validated.normalized.legal_name,
      commission_rfc: validated.normalized.rfc,
      commission_clabe: validated.normalized.clabe,
      commission_fiscal_updated_at: now,
    })
    .eq('id', userId);

  if (error) {
    if (isMissingFiscalColumn(error)) {
      return {
        ok: false,
        error: 'Falta migración SQL. Ejecuta docs/supabase-migrations/profiles_commission_fiscal.sql',
        needsMigration: true,
      };
    }
    if (error.code === '23505' || error.message?.includes('idx_profiles_commission_rfc_unique')) {
      return {
        ok: false,
        error: 'Este RFC ya está registrado en otra cuenta de AVENTA.',
      };
    }
    console.error('[commissionFiscal] save', error.message);
    return { ok: false, error: 'No se pudieron guardar los datos fiscales' };
  }

  return {
    ok: true,
    fiscal: {
      legalName: validated.normalized.legal_name,
      rfc: validated.normalized.rfc,
      clabe: validated.normalized.clabe,
      updatedAt: now,
    },
  };
}

export async function loadFiscalProfilesByUserIds(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, CommissionFiscalProfile & { acceptedAt: string | null }>> {
  const map = new Map<string, CommissionFiscalProfile & { acceptedAt: string | null }>();
  if (userIds.length === 0) return map;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at, commissions_accepted_at',
    )
    .in('id', userIds);

  if (error) {
    console.error('[commissionFiscal] batch load', error.message);
    return map;
  }

  for (const row of data ?? []) {
    const r = row as {
      id: string;
      commission_legal_name?: string | null;
      commission_rfc?: string | null;
      commission_clabe?: string | null;
      commission_fiscal_updated_at?: string | null;
      commissions_accepted_at?: string | null;
    };
    map.set(r.id, {
      ...fiscalProfileFromRow(r),
      acceptedAt: r.commissions_accepted_at ?? null,
    });
  }
  return map;
}

export async function findAllDuplicateRfcs(
  supabase: SupabaseClient,
  rfcs: string[],
): Promise<Set<string>> {
  const duplicates = new Set<string>();
  const unique = [...new Set(rfcs.map((r) => r.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return duplicates;

  const { data, error } = await supabase
    .from('profiles')
    .select('commission_rfc')
    .in('commission_rfc', unique);

  if (error || !data) return duplicates;

  const counts = new Map<string, number>();
  for (const row of data) {
    const rfc = (row as { commission_rfc?: string }).commission_rfc?.toUpperCase();
    if (!rfc) continue;
    counts.set(rfc, (counts.get(rfc) ?? 0) + 1);
  }
  for (const [rfc, count] of counts) {
    if (count > 1) duplicates.add(rfc);
  }
  return duplicates;
}

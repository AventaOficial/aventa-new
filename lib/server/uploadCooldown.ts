/**
 * Cooldown de publicación — lógica compartida (status UI + enforce en POST /api/offers).
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';

const COOLDOWN_SECONDS_DEFAULT = 15;
const COOLDOWN_SECONDS_LEVEL_4 = 5;

function parseExemptConfig(raw: unknown): { ids: Set<string>; emails: Set<string> } {
  const ids = new Set<string>();
  const emails = new Set<string>();

  const addToken = (token: string) => {
    const t = token.trim().toLowerCase();
    if (!t) return;
    if (t.includes('@')) emails.add(t);
    else ids.add(t);
  };

  if (Array.isArray(raw)) {
    raw.forEach((v) => {
      if (typeof v === 'string') addToken(v);
    });
    return { ids, emails };
  }

  if (typeof raw === 'string') {
    raw
      .split(/[,\n;]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach(addToken);
    return { ids, emails };
  }

  if (raw && typeof raw === 'object') {
    const obj = raw as { ids?: unknown; emails?: unknown };
    if (Array.isArray(obj.ids)) obj.ids.forEach((v) => typeof v === 'string' && addToken(v));
    if (Array.isArray(obj.emails)) obj.emails.forEach((v) => typeof v === 'string' && addToken(v));
  }

  return { ids, emails };
}

export type UploadCooldownStatus = {
  exempt: boolean;
  canUpload: boolean;
  remainingSeconds: number;
  cooldownSeconds: number;
  reputationLevel: number;
};

export async function getUploadCooldownStatus(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'email'>,
): Promise<UploadCooldownStatus> {
  const [{ data: configRow }, { data: profile }] = await Promise.all([
    supabase
      .from('app_config')
      .select('value')
      .eq('key', 'upload_cooldown_exempt_user_ids')
      .maybeSingle(),
    supabase.from('profiles').select('reputation_level').eq('id', user.id).maybeSingle(),
  ]);

  const raw = (configRow as { value?: unknown } | null)?.value;
  const { ids, emails } = parseExemptConfig(raw);
  const exempt =
    ids.has(user.id.toLowerCase()) || (user.email ? emails.has(user.email.toLowerCase()) : false);

  const reputationLevel = Math.max(
    1,
    (profile as { reputation_level?: number } | null)?.reputation_level ?? 1,
  );
  const cooldownSeconds = exempt
    ? 0
    : reputationLevel >= 4
      ? COOLDOWN_SECONDS_LEVEL_4
      : COOLDOWN_SECONDS_DEFAULT;

  let remainingSeconds = 0;
  if (!exempt && cooldownSeconds > 0) {
    const { data: lastOffer } = await supabase
      .from('offers')
      .select('created_at')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const createdAt = (lastOffer as { created_at?: string } | null)?.created_at;
    if (createdAt) {
      const elapsed = (Date.now() - new Date(createdAt).getTime()) / 1000;
      remainingSeconds = Math.max(0, Math.ceil(cooldownSeconds - elapsed));
    }
  }

  return {
    exempt,
    canUpload: exempt || remainingSeconds === 0,
    remainingSeconds,
    cooldownSeconds,
    reputationLevel,
  };
}

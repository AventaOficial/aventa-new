export type SocialNetwork = 'tiktok' | 'instagram' | 'x';

export type SocialConfig = {
  tiktok: string;
  instagram: string;
  x: string;
  last_video_url: string;
  last_video_title: string;
  last_video_network: SocialNetwork | '';
  last_video_at: string;
};

export const EMPTY_SOCIAL: SocialConfig = {
  tiktok: '',
  instagram: '',
  x: '',
  last_video_url: '',
  last_video_title: '',
  last_video_network: '',
  last_video_at: '',
};

const HOSTS: Record<SocialNetwork, string[]> = {
  tiktok: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
  instagram: ['instagram.com', 'www.instagram.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
};

export function parseSocialConfig(raw: unknown): SocialConfig {
  const obj =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, unknown>;
          } catch {
            return {};
          }
        })()
      : raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};
  const network = obj.last_video_network;
  return {
    tiktok: typeof obj.tiktok === 'string' ? obj.tiktok.trim() : '',
    instagram: typeof obj.instagram === 'string' ? obj.instagram.trim() : '',
    x: typeof obj.x === 'string' ? obj.x.trim() : '',
    last_video_url: typeof obj.last_video_url === 'string' ? obj.last_video_url.trim() : '',
    last_video_title: typeof obj.last_video_title === 'string' ? obj.last_video_title.trim() : '',
    last_video_network:
      network === 'tiktok' || network === 'instagram' || network === 'x' ? network : '',
    last_video_at: typeof obj.last_video_at === 'string' ? obj.last_video_at : '',
  };
}

export function isAllowedSocialUrl(url: string, network?: SocialNetwork): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (network) return HOSTS[network].some((h) => host === h || host.endsWith(`.${h}`));
    return Object.values(HOSTS).some((list) => list.some((h) => host === h || host.endsWith(`.${h}`)));
  } catch {
    return false;
  }
}

export async function getSocialLinks(): Promise<SocialConfig> {
  try {
    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = createServerClient();
    const { data } = await supabase.from('app_config').select('value').eq('key', 'social_links').maybeSingle();
    return parseSocialConfig((data as { value?: unknown } | null)?.value);
  } catch {
    return EMPTY_SOCIAL;
  }
}

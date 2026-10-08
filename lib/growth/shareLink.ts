import { resolveCampaignKey } from '@/lib/attribution/channels';

export type ShareChannel = 'whatsapp' | 'telegram' | 'facebook' | 'instagram' | 'copy';

export function buildShareUrl(origin: string, path: string, channel: ShareChannel, contentId?: string | null): string {
  const base = `${origin.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  const url = new URL(base);
  const source = channel === 'copy' || channel === 'facebook' ? 'share' : channel;
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', 'share');
  const content = resolveCampaignKey(contentId ?? undefined) ?? (channel === 'facebook' ? 'facebook' : null);
  if (content) url.searchParams.set('utm_content', content);
  return url.toString();
}

export function whatsAppShareHref(shareUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(shareUrl)}`;
}

export function telegramShareHref(shareUrl: string): string {
  return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}`;
}

export function facebookShareHref(shareUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
}

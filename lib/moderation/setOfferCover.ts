import { coverSelectionPayload } from '@/lib/moderation/galleryNavigation';

export type SetOfferCoverResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string };

/** Reordena la galería para que `src` sea la portada (PATCH update-offer con image_url + image_urls). */
export async function setOfferCover(
  offerId: string,
  images: string[],
  src: string,
  accessToken: string | null | undefined
): Promise<SetOfferCoverResult> {
  const payload = coverSelectionPayload(images, src);
  if (!payload) return { ok: false, error: 'Esa foto ya es la portada' };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  try {
    const res = await fetch('/api/admin/update-offer', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ id: offerId, ...payload }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: typeof data.error === 'string' ? data.error : 'No se pudo cambiar la portada' };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'No se pudo cambiar la portada' };
  }
}

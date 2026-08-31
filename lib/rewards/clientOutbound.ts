import { buildOfferUrl } from '@/lib/offerUrl';

/** Registra clic saliente y abre URL con sub-id cuando exista clickId. */
export async function trackAndOpenOfferUrl(input: {
  offerId: string;
  offerUrl: string;
  accessToken?: string | null;
}): Promise<void> {
  const trimmed = input.offerUrl.trim();
  if (!trimmed) return;

  let clickId: string | null = null;
  try {
    const res = await fetch('/api/track-outbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
      },
      body: JSON.stringify({ offerId: input.offerId, offerUrl: trimmed }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as { clickId?: string | null } | null;
      clickId = data?.clickId ?? null;
    }
  } catch {
    /* degradar sin sub-id */
  }

  const url =
    clickId != null
      ? buildOfferUrl(trimmed, { offerId: input.offerId, clickId })
      : buildOfferUrl(trimmed);
  window.open(url, '_blank', 'noopener,noreferrer');
}

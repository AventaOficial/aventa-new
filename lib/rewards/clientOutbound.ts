import { buildOfferUrl } from '@/lib/offerUrl';

/** Tiempo máximo que la pestaña nueva espera el clickId antes de abrir la tienda sin sub-id. */
export const OUTBOUND_TRACK_TIMEOUT_MS = 1500;

export type OutboundInput = {
  offerId: string;
  offerUrl: string;
  accessToken?: string | null;
  couponCorrelationId?: string | null;
  couponCode?: string | null;
};

async function requestClickId(input: OutboundInput, offerUrl: string, timeoutMs: number): Promise<string | null> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch('/api/track-outbound', {
      method: 'POST',
      keepalive: true,
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(input.accessToken ? { Authorization: `Bearer ${input.accessToken}` } : {}),
      },
      body: JSON.stringify({
        offerId: input.offerId,
        offerUrl,
        ...(input.couponCorrelationId ? { couponCorrelationId: input.couponCorrelationId, couponCode: input.couponCode ?? null } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { clickId?: string | null } | null;
    return data?.clickId ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Solo http(s): la pestaña nueva nace en el origen de Aventa y no debe cargar `javascript:` ni `data:`. */
export function isSafeOutboundUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Clic con modificador o botón no principal: el navegador abre el enlace por su cuenta. */
export function isNativeOpenClick(e: {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}): boolean {
  return Boolean(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e.button != null && e.button !== 0));
}

/** Registra el clic sin navegar; para cuando el navegador ya abre el enlace. */
export function trackOutboundClick(input: OutboundInput): void {
  const trimmed = input.offerUrl.trim();
  if (!isSafeOutboundUrl(trimmed)) return;
  void requestClickId(input, trimmed, OUTBOUND_TRACK_TIMEOUT_MS);
}

/**
 * Abre la tienda en una pestaña nueva y registra el clic.
 * La pestaña se abre dentro del gesto del usuario (Safari iOS bloquea `window.open` tras un `await`)
 * y recibe la URL con sub-id cuando responde el registro. Si el registro falla o tarda,
 * abre la URL sin sub-id. Si el navegador bloquea la pestaña, navega en la actual;
 * si el usuario ya la cerró, no hace nada.
 */
export async function trackAndOpenOfferUrl(input: OutboundInput): Promise<void> {
  const trimmed = input.offerUrl.trim();
  if (!isSafeOutboundUrl(trimmed)) return;

  let tab: Window | null = null;
  try {
    tab = window.open('', '_blank');
  } catch {
    tab = null;
  }
  if (tab) {
    try {
      tab.opener = null;
    } catch {
      /* algunos navegadores no permiten escribirlo */
    }
  }

  const clickId = await requestClickId(input, trimmed, OUTBOUND_TRACK_TIMEOUT_MS);
  const url =
    clickId != null
      ? buildOfferUrl(trimmed, { offerId: input.offerId, clickId })
      : buildOfferUrl(trimmed);
  if (!isSafeOutboundUrl(url)) {
    tab?.close();
    return;
  }

  if (!tab) {
    window.location.assign(url);
    return;
  }
  if (!tab.closed) tab.location.replace(url);
}

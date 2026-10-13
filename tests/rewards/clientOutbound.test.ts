import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/offerUrl', () => ({
  buildOfferUrl: (url: string, tracking?: { offerId?: string; clickId?: string }) =>
    tracking?.clickId ? `${url}?sub=${tracking.offerId}:${tracking.clickId}` : url,
}));

import {
  isNativeOpenClick,
  isSafeOutboundUrl,
  OUTBOUND_TRACK_TIMEOUT_MS,
  trackAndOpenOfferUrl,
  trackOutboundClick,
} from '@/lib/rewards/clientOutbound';

const OFFER_URL = 'https://tienda.example.com/producto/123';

type FakeTab = { opener: unknown; closed: boolean; location: { replace: ReturnType<typeof vi.fn> } };

function fakeTab(): FakeTab {
  return { opener: {}, closed: false, location: { replace: vi.fn() } };
}

let events: string[];
let assign: ReturnType<typeof vi.fn>;

function stubWindow(open: () => FakeTab | null) {
  assign = vi.fn();
  vi.stubGlobal('window', {
    open: vi.fn((...args: unknown[]) => {
      events.push(`open:${String(args[0])}`);
      return open();
    }),
    location: { assign },
  });
}

function stubFetch(impl: (init: RequestInit) => Promise<Response>) {
  const spy = vi.fn((_url: string, init: RequestInit) => {
    events.push('fetch');
    return impl(init);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  events = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('trackAndOpenOfferUrl', () => {
  it('abre la pestaña antes de esperar el registro y la lleva a la URL con sub-id', async () => {
    const tab = fakeTab();
    stubWindow(() => tab);
    const fetchSpy = stubFetch(async () => json({ clickId: 'click-1' }));

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: ` ${OFFER_URL} `, accessToken: 'tok' });

    expect(events).toEqual(['open:', 'fetch']);
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).toHaveBeenCalledTimes(1);
    expect(tab.location.replace).toHaveBeenCalledWith(`${OFFER_URL}?sub=offer-1:click-1`);
    expect(assign).not.toHaveBeenCalled();

    const init = fetchSpy.mock.calls[0][1];
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ offerId: 'offer-1', offerUrl: OFFER_URL });
  });

  it('si el registro falla, igual abre la tienda sin sub-id', async () => {
    const tab = fakeTab();
    stubWindow(() => tab);
    stubFetch(async () => {
      throw new Error('red caída');
    });

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: OFFER_URL });

    expect(tab.location.replace).toHaveBeenCalledWith(OFFER_URL);
  });

  it('una respuesta de error del registro no rompe la salida', async () => {
    const tab = fakeTab();
    stubWindow(() => tab);
    stubFetch(async () => json({ error: 'x' }, 500));

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: OFFER_URL });

    expect(tab.location.replace).toHaveBeenCalledTimes(1);
  });

  it('si el registro tarda, abre la tienda al vencer el tiempo límite', async () => {
    vi.useFakeTimers();
    const tab = fakeTab();
    stubWindow(() => tab);
    stubFetch(
      (init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const pending = trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: OFFER_URL });
    expect(tab.location.replace).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(OUTBOUND_TRACK_TIMEOUT_MS);
    await pending;

    expect(tab.location.replace).toHaveBeenCalledTimes(1);
  });

  it('si el navegador bloquea la pestaña, navega en la actual', async () => {
    stubWindow(() => null);
    stubFetch(async () => json({ clickId: null }));

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: OFFER_URL });

    expect(assign).toHaveBeenCalledWith(OFFER_URL);
  });

  it('si el usuario cerró la pestaña, no navega la actual', async () => {
    const tab = fakeTab();
    stubWindow(() => tab);
    stubFetch(async () => {
      tab.closed = true;
      return json({ clickId: 'click-1' });
    });

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: OFFER_URL });

    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('una URL que no es http(s) no abre pestaña ni registra', async () => {
    stubWindow(() => fakeTab());
    const fetchSpy = stubFetch(async () => json({}));

    for (const bad of ['javascript:alert(1)', 'data:text/html,hola', 'tienda.example.com/sin-esquema']) {
      await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: bad });
    }

    expect(events).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('sin URL no abre nada ni registra', async () => {
    stubWindow(() => fakeTab());
    const fetchSpy = stubFetch(async () => json({}));

    await trackAndOpenOfferUrl({ offerId: 'offer-1', offerUrl: '   ' });

    expect(events).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('isSafeOutboundUrl', () => {
  it('acepta solo http y https', () => {
    expect(isSafeOutboundUrl('https://www.amazon.com.mx/dp/B000?tag=x')).toBe(true);
    expect(isSafeOutboundUrl('http://tienda.example.com/a')).toBe(true);
    expect(isSafeOutboundUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeOutboundUrl('JAVASCRIPT:alert(1)')).toBe(false);
    expect(isSafeOutboundUrl('data:text/html,x')).toBe(false);
    expect(isSafeOutboundUrl('//evil.example.com')).toBe(false);
    expect(isSafeOutboundUrl('')).toBe(false);
  });
});

describe('clic nativo', () => {
  it('reconoce Ctrl, Cmd, Shift, Alt y botones no principales', () => {
    expect(isNativeOpenClick({ button: 0 })).toBe(false);
    expect(isNativeOpenClick({ button: 0, ctrlKey: true })).toBe(true);
    expect(isNativeOpenClick({ button: 0, metaKey: true })).toBe(true);
    expect(isNativeOpenClick({ button: 0, shiftKey: true })).toBe(true);
    expect(isNativeOpenClick({ button: 0, altKey: true })).toBe(true);
    expect(isNativeOpenClick({ button: 1 })).toBe(true);
  });

  it('trackOutboundClick registra sin abrir ventanas', () => {
    stubWindow(() => fakeTab());
    const fetchSpy = stubFetch(async () => json({ clickId: 'click-1' }));

    trackOutboundClick({ offerId: 'offer-1', offerUrl: OFFER_URL });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['fetch']);

    trackOutboundClick({ offerId: 'offer-1', offerUrl: 'javascript:alert(1)' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

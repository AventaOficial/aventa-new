'use client';

import { useEffect } from 'react';

export const PAGE_VIEW_ENDPOINT = '/api/page-view';

/**
 * Un page_view por carga de documento. Vive en el layout raíz, que no se vuelve a montar
 * al navegar dentro de la app, igual que el registro anterior desde el render del servidor.
 */
export function PageViewBeacon() {
  useEffect(() => {
    const body = JSON.stringify({ path: window.location.pathname, search: window.location.search });
    try {
      if (navigator.sendBeacon?.(PAGE_VIEW_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch {
      // sendBeacon puede lanzar con políticas de contenido estrictas; se usa fetch.
    }
    void fetch(PAGE_VIEW_ENDPOINT, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, []);
  return null;
}

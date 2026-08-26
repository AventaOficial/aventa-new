'use client';

import { useEffect } from 'react';

/**
 * Congela el scroll de la página mientras una hoja o modal está abierta y
 * devuelve al usuario a su posición al cerrar. En iOS no basta con
 * `overflow: hidden`: hay que fijar el body, de ahí el desplazamiento negativo.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}

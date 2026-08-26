'use client';

import { useState, useEffect } from 'react';
import { X, Smartphone, Share } from 'lucide-react';

const STORAGE_KEY = 'aventa_install_banner_dismissed';

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if ('ontouchstart' in window) return window.innerWidth < 1024;
  return false;
}

export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileDevice()) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    const android = /Android/i.test(navigator.userAgent);
    setIsIOS(isApple);
    setIsAndroid(android);
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => Promise<void> });
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (isApple || android) setVisible(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, 'true');
      return;
    }
    if (isIOS) {
      setShowIosHelp(true);
      return;
    }
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  const handleDismiss = () => {
    setVisible(false);
    setShowIosHelp(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!visible && !showIosHelp) return null;

  if (showIosHelp) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-label="Añadir Aventa a la pantalla de inicio"
      >
        <div className="w-full max-w-md rounded-t-3xl border border-[#333] bg-[#1d1d1f] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:rounded-3xl">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold">Añadir Aventa al iPhone</p>
              <p className="mt-1 text-sm text-gray-400">Safari no permite un botón automático; son tres pasos:</p>
            </div>
            <button type="button" onClick={handleDismiss} className="rounded-full p-2 text-gray-400 hover:text-white" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </button>
          </div>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold">1</span>
              <span>
                Toca <Share className="inline h-4 w-4 align-text-bottom text-violet-300" aria-hidden /> Compartir abajo en Safari
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold">2</span>
              <span>Elige «Añadir a pantalla de inicio»</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold">3</span>
              <span>Confirma con «Añadir»</span>
            </li>
          </ol>
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-violet-600 text-sm font-semibold hover:bg-violet-500"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 border-t border-[#333] bg-[#1d1d1f] px-4 py-3 text-white shadow-lg md:left-1/2 md:right-auto md:bottom-0 md:w-full md:max-w-md md:-translate-x-1/2 md:rounded-t-2xl"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      role="region"
      aria-label="Instalar app"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Smartphone className="h-5 w-5 shrink-0 text-violet-400" />
        <p className="truncate text-sm font-medium">Instalar AVENTA en tu pantalla</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold transition-colors hover:bg-violet-500"
        >
          {isAndroid && deferredPrompt ? 'Instalar' : isIOS ? 'Ver cómo' : deferredPrompt ? 'Instalar' : 'Añadir'}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-2 text-gray-400 transition-colors hover:text-white"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

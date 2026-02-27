'use client';

import { useState, useEffect } from 'react';
import { X, Smartphone } from 'lucide-react';

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
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isMobileDevice()) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) return;

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isApple);
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => Promise<void> });
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (isApple) setVisible(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    } else if (isIOS) {
      setVisible(false);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!visible) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[9998] flex items-center justify-between gap-3 bg-[#1d1d1f] dark:bg-[#1d1d1f] text-white px-4 py-3 shadow-lg border-t border-[#333] md:rounded-t-2xl md:left-1/2 md:right-auto md:bottom-0 md:w-full md:max-w-md md:-translate-x-1/2"
      style={{ bottom: '5rem' }}
      role="region"
      aria-label="Instalar app"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Smartphone className="h-5 w-5 shrink-0 text-violet-400" />
        <p className="text-sm font-medium truncate">
          Instalar AVENTA en tu pantalla
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleInstall}
          className="rounded-full bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-semibold transition-colors"
        >
          Añadir
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

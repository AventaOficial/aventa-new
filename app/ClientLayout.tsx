'use client';

import Navbar from './components/Navbar';
import ActionBar from './components/ActionBar';
import OnboardingV1 from './components/OnboardingV1';
import InstallAppBanner from './components/InstallAppBanner';
import { useUI } from './providers/UIProvider';
import { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { layoutReady, showOnboarding, toastMessage } = useUI();
  const showMain = layoutReady && !showOnboarding;

  return (
    <>
      <Navbar />
      <OnboardingV1 />
      {showMain ? (
        <main className="pb-24 md:pb-0 md:pl-28 min-h-screen">
          {children}
        </main>
      ) : (
        <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] flex flex-col items-center justify-center gap-3" aria-hidden>
          <span className="text-xl font-semibold tracking-[0.2em] text-violet-600 dark:text-violet-400">AVENTA</span>
          <div className="h-1 w-16 rounded-full bg-[#e5e5e7] dark:bg-[#262626] overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
          </div>
        </div>
      )}
      {showMain && <InstallAppBanner />}
      <ActionBar />
      {toastMessage && (
        <div
          className="fixed bottom-28 left-1/2 z-[10001] -translate-x-1/2 rounded-2xl bg-[#1d1d1f] dark:bg-[#1d1d1f] px-5 py-3 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
    </>
  );
}

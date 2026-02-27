'use client';

import Navbar from './components/Navbar';
import ActionBar from './components/ActionBar';
import OnboardingV1 from './components/OnboardingV1';
import { useUI } from './providers/UIProvider';
import { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  const { layoutReady, toastMessage } = useUI();

  return (
    <>
      <Navbar />
      <OnboardingV1 />
      {layoutReady ? (
        <main className="pb-24 md:pb-0 md:pl-28 min-h-screen">
          {children}
        </main>
      ) : (
        <div className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a]" aria-hidden />
      )}
      <ActionBar />
      {/* Toast simple */}
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

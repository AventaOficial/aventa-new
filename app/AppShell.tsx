import { Suspense, type ReactNode } from 'react';
import ClientLayout from './ClientLayout';

function AppShellFallback() {
  return (
    <div
      className="min-h-screen bg-[#F5F5F7] dark:bg-[#0a0a0a] flex items-center justify-center"
      aria-hidden
    >
      <div className="h-1 w-16 rounded-full bg-[#e5e5e7] dark:bg-[#262626] overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
      </div>
    </div>
  );
}

/** Server wrapper: ClientLayout uses ActionBar (useSearchParams) and needs a Suspense boundary at prerender. */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <ClientLayout>{children}</ClientLayout>
    </Suspense>
  );
}

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * /subir — Entry point for the browser extension (and deep links).
 * Redirects to / with upload=1 and prefilled params so the upload modal opens with data.
 */
function SubirPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('upload', '1');
    const title = searchParams.get('title');
    const image = searchParams.get('image');
    const offer_url = searchParams.get('url') || searchParams.get('offer_url');
    const store = searchParams.get('store');
    if (title) params.set('title', title);
    if (image) params.set('image', image);
    if (offer_url) params.set('offer_url', offer_url);
    if (store) params.set('store', store);
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
      <p className="text-gray-500 dark:text-gray-400 text-sm">Redirigiendo a AVENTA…</p>
    </div>
  );
}

export default function SubirPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <p className="text-gray-500 dark:text-gray-400 text-sm">Redirigiendo a AVENTA…</p>
        </div>
      }
    >
      <SubirPageInner />
    </Suspense>
  );
}

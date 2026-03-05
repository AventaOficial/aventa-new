'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirige a la página standalone Mi panel. El layout también redirige /admin/owner → /mi-panel. */
export default function AdminOwnerRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/mi-panel');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">Redirigiendo…</p>
    </div>
  );
}

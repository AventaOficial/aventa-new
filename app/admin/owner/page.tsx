'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirige al centro de operaciones del dueño. */
export default function AdminOwnerRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/operaciones');
  }, [router]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-500 dark:text-gray-400">Redirigiendo…</p>
    </div>
  );
}

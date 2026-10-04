'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/providers/AuthProvider';

export function TeamLogoutButton() {
  const { signOut } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch('/api/team/gate', { method: 'DELETE' });
      await signOut();
      router.replace('/');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded-full px-3 py-1.5 text-sm text-[#424245] hover:bg-[#f5f5f7] disabled:opacity-60 dark:text-[#a1a1a6] dark:hover:bg-[#1c1c1c]"
    >
      {pending ? 'Saliendo...' : 'Salir'}
    </button>
  );
}

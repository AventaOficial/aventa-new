import type { ReactNode } from 'react';

/** El chrome de Founder OS lo aplica `app/admin/layout.tsx` cuando el rol es owner. */
export default function OwnerLayout({ children }: { children: ReactNode }) {
  return children;
}

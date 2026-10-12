import type { ReactNode } from 'react';
import AdminShell from './AdminShell';

/** El layout raíz ya no fuerza render dinámico; el panel admin nunca debe salir de la caché pública. */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

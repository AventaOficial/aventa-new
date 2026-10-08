import { redirect } from 'next/navigation';

/** Compatibilidad. El mapa de enlaces dejó de ser un segundo menú. */
export default function AdminContextoPage() {
  redirect('/admin/sistemas/mapa');
}

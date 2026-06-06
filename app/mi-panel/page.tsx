import { redirect } from 'next/navigation';

/** El mapa por áreas del admin vive en /admin/contexto. */
export default function MiPanelRedirectPage() {
  redirect('/admin/contexto');
}

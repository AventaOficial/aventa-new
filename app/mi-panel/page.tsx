import { redirect } from 'next/navigation';

/** El mapa por áreas del admin vive en /contexto. */
export default function MiPanelRedirectPage() {
  redirect('/contexto');
}

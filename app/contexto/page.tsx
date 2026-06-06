import { redirect } from 'next/navigation';

/** Legacy: el contexto vive en el panel admin. */
export default function ContextoLegacyRedirect() {
  redirect('/admin/contexto');
}

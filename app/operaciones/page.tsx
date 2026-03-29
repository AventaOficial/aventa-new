import { redirect } from 'next/navigation';

/** URL canónica: /admin/operaciones (panel admin). */
export default function OperacionesLegacyRedirect() {
  redirect('/admin/operaciones');
}

import { redirect } from 'next/navigation';

/** El estado económico vive en la vista de pagos del CEO. */
export default function EconomiaPage() {
  redirect('/admin/owner/vista/pagos');
}

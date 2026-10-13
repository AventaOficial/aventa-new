import { redirect } from 'next/navigation';

/** El estado de los payouts vive en la vista de pagos del CEO. */
export default function PayoutsPage() {
  redirect('/admin/owner/vista/pagos');
}

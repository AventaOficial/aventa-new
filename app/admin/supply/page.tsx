import { redirect } from 'next/navigation';

/** La salud de la oferta vive en Ofertas publicadas; los cazadores, en Crecimiento. */
export default function SupplyHomePage() {
  redirect('/admin/owner/vista/ofertas');
}

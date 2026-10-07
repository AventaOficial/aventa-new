import { redirect } from 'next/navigation';

/** El índice de equipos abre el tablero que ya existe. */
export default function EquiposIndexPage() {
  redirect('/admin/owner/vista/equipos/moderacion');
}

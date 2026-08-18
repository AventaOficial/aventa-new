import { redirect } from 'next/navigation';

/** Legacy: el hub de equipo vive en `/equipo`, no en admin. */
export default function AdminEquipoLegacyRedirect() {
  redirect('/equipo');
}

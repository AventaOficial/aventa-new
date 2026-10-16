import { redirect } from 'next/navigation';

/** URL histórica de marketing; el programa público vive en /comisiones y el panel en /me/recompensas. */
export default function RecompensasRedirect() {
  redirect('/comisiones');
}

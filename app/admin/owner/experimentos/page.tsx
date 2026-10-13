import { redirect } from 'next/navigation';

/** Los experimentos activos viven en la vista de Crecimiento del CEO. */
export default function ExperimentosPage() {
  redirect('/admin/owner/vista/crecimiento');
}

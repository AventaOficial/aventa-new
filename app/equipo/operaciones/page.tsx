import StaffDepartmentView from '../components/StaffDepartmentView';

export default function EquipoOperacionesPage() {
  return (
    <StaffDepartmentView
      department="operaciones"
      title="Operaciones"
      subtitle="Salud de ofertas, precios que cambiaron y agotados. Escala a fundador si algo crítico falla."
      actionLinks={[
        { label: 'Salud del sistema', href: '/admin/health' },
        { label: 'Métricas', href: '/admin/metrics' },
      ]}
    />
  );
}

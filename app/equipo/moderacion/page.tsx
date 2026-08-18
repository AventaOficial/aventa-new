import StaffDepartmentView from '../components/StaffDepartmentView';

export default function EquipoModeracionPage() {
  return (
    <StaffDepartmentView
      department="moderacion"
      title="Moderación"
      subtitle="Cola del bot, ofertas de cazadores y reportes. Publica solo lo que abre en tienda con descuento real."
      showQualityRules
      actionLinks={[
        { label: 'Abrir cola de moderación', href: '/admin/moderation' },
        { label: 'Reportes', href: '/admin/moderation/reports' },
        { label: 'Aprobadas hoy', href: '/admin/moderation/approved' },
      ]}
    />
  );
}

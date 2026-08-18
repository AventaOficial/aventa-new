import StaffDepartmentView from '../components/StaffDepartmentView';

export default function EquipoContabilidadPage() {
  return (
    <StaffDepartmentView
      department="contabilidad"
      title="Contabilidad"
      subtitle="Ledger de afiliados, pools mensuales y pagos a cazadores. El fundador marca pagos en admin cuando el programa esté activo."
    />
  );
}

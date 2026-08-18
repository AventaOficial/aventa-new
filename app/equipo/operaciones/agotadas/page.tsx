import ModerationHealthOffersPanel from '@/app/admin/moderation/panels/ModerationHealthOffersPanel';

export default function EquipoOperacionesAgotadasPage() {
  return (
    <ModerationHealthOffersPanel
      status="out_of_stock"
      title="Agotadas"
      emptyMessage="No hay ofertas marcadas como agotadas."
      apiBase="/api/staff/offer-health-queue"
      readOnly
    />
  );
}

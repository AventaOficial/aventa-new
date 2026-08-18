import ModerationHealthOffersPanel from '@/app/admin/moderation/panels/ModerationHealthOffersPanel';

export default function EquipoOperacionesPrecioPage() {
  return (
    <ModerationHealthOffersPanel
      status="price_changed"
      title="Precio cambiado"
      emptyMessage="No hay ofertas con precio distinto al publicado."
      apiBase="/api/staff/offer-health-queue"
      readOnly
    />
  );
}

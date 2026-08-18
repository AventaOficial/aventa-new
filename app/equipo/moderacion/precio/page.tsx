import ModerationHealthOffersPanel from '@/app/admin/moderation/panels/ModerationHealthOffersPanel';

export default function EquipoModeracionPrecioPage() {
  return (
    <ModerationHealthOffersPanel
      status="price_changed"
      title="Precio cambió"
      emptyMessage="No hay ofertas con cambio de precio detectado."
    />
  );
}

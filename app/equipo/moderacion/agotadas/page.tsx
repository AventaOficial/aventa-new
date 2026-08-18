import ModerationHealthOffersPanel from '@/app/admin/moderation/panels/ModerationHealthOffersPanel';

export default function EquipoModeracionAgotadasPage() {
  return (
    <ModerationHealthOffersPanel
      status="out_of_stock"
      title="Agotadas"
      emptyMessage="No hay ofertas marcadas como agotadas."
    />
  );
}

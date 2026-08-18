import ModerationOffersHistoryPanel from '@/app/admin/moderation/panels/ModerationOffersHistoryPanel';

export default function EquipoModeracionRechazadasPage() {
  return (
    <ModerationOffersHistoryPanel
      status="rejected"
      title="Rechazadas recientemente"
      emptyMessage="No hay ofertas rechazadas recientes."
    />
  );
}

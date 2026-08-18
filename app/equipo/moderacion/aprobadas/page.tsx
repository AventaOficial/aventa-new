import ModerationOffersHistoryPanel from '@/app/admin/moderation/panels/ModerationOffersHistoryPanel';

export default function EquipoModeracionAprobadasPage() {
  return (
    <ModerationOffersHistoryPanel
      status="approved"
      title="Aprobadas recientemente"
      emptyMessage="No hay ofertas aprobadas recientes."
    />
  );
}

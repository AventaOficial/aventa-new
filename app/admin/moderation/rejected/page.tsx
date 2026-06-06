import ModerationOffersHistoryPanel from '../panels/ModerationOffersHistoryPanel';

export default function RejectedPage() {
  return (
    <ModerationOffersHistoryPanel
      status="rejected"
      title="Ofertas rechazadas"
      emptyMessage="No hay ofertas rechazadas."
    />
  );
}

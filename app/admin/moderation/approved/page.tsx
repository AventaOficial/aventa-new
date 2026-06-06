import ModerationOffersHistoryPanel from '../panels/ModerationOffersHistoryPanel';

export default function ApprovedPage() {
  return (
    <ModerationOffersHistoryPanel
      status="approved"
      title="Ofertas aprobadas"
      emptyMessage="No hay ofertas aprobadas."
    />
  );
}

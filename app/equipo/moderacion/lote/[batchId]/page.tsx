import OfferBatchOps from '@/app/components/moderation/OfferBatchOps';

export default async function EquipoModeracionLoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ process?: string }>;
}) {
  const { batchId } = await params;
  const sp = await searchParams;
  return <OfferBatchOps mode="workspace" batchId={batchId} autoProcess={sp.process === '1'} />;
}

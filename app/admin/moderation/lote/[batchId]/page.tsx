import OfferBatchOps from '@/app/components/moderation/OfferBatchOps';

export default async function AdminModerationLoteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ process?: string }>;
}) {
  const { batchId } = await params;
  const sp = await searchParams;
  return <OfferBatchOps mode="admin" batchId={batchId} autoProcess={sp.process === '1'} />;
}

import { redirect } from 'next/navigation';

type Props = {
  searchParams: Promise<{ status?: string }>;
};

export default async function ReportsRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.status ? `?status=${encodeURIComponent(params.status)}` : '';
  redirect(`/admin/moderation/reports${query}`);
}

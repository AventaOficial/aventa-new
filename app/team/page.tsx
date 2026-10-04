import { redirect } from 'next/navigation';
import { resolveTeamPage } from '@/lib/team/gate/require';

export default async function TeamIndexPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') {
    redirect('/team/gate?next=/team');
  }
  if (entry.kind === 'no-access' || entry.kind === 'unavailable') {
    redirect('/team/no-access');
  }
  redirect('/team/select');
}

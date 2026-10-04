import { redirect } from 'next/navigation';
import { decideTeamHome } from '@/lib/team/config/navigation';
import { resolveTeamPage } from '@/lib/team/gate/require';

export default async function TeamIndexPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') {
    redirect('/team/gate?next=/team');
  }
  if (entry.kind === 'no-access' || entry.kind === 'unavailable' || entry.kind === 'forbidden') {
    redirect('/team/no-access');
  }
  if (entry.kind !== 'select') redirect('/team/select');

  const destination = decideTeamHome(entry.memberships.map((membership) => membership.teamId));
  if (destination.kind === 'team') redirect(`/team/${destination.teamId}`);
  if (destination.kind === 'no-access') redirect('/team/no-access');
  redirect('/team/select');
}

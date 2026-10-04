import { notFound, redirect } from 'next/navigation';
import { teamMetadata } from '@/lib/team/config/catalog';
import { buildTeamShellContext } from '@/lib/team/config/navigation';
import { mexicoCityHour, teamGreeting } from '@/lib/team/config/greeting';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { readTeamPersonName } from '@/lib/team/shell/profile';
import { isTeamId } from '@/lib/team/roles/teams';
import { TeamShell } from '../shell/TeamShell';

type Props = { params: Promise<{ team: string }> };

export default async function TeamAreaPage({ params }: Props) {
  const { team } = await params;
  if (!isTeamId(team)) notFound();

  const entry = await resolveTeamPage(team);
  if (entry.kind === 'login' || entry.kind === 'gate') {
    redirect(`/team/gate?next=/team/${team}`);
  }
  if (entry.kind === 'unavailable') {
    redirect('/team/no-access');
  }
  if (entry.kind !== 'allow') notFound();

  const personName = await readTeamPersonName(entry.membership.userId);
  const context = buildTeamShellContext({
    membership: entry.membership,
    memberships: entry.memberships,
    personName,
    greeting: teamGreeting(mexicoCityHour()),
  });
  if (!context) notFound();

  const metadata = teamMetadata(entry.membership.teamId);

  return (
    <TeamShell context={context}>
      <p className="text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]">{metadata.tagline}</p>
      <p className="mt-3 text-sm leading-6 text-[#424245] dark:text-[#a1a1a6]">{metadata.homeLine}</p>
    </TeamShell>
  );
}

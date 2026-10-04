import { notFound, redirect } from 'next/navigation';
import { buildTeamShellContext } from '@/lib/team/config/navigation';
import { mexicoCityHour, teamGreeting } from '@/lib/team/config/greeting';
import { buildTeamHeroPayload } from '@/lib/team/hero/build';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { readTeamPersonName } from '@/lib/team/shell/profile';
import { isTeamId } from '@/lib/team/roles/teams';
import { TeamHero } from '../hero/TeamHero';
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
  const greeting = teamGreeting(mexicoCityHour());
  const context = buildTeamShellContext({
    membership: entry.membership,
    memberships: entry.memberships,
    personName,
    greeting,
  });
  if (!context) notFound();

  const hero = await buildTeamHeroPayload({
    requestedTeam: entry.membership.teamId,
    memberships: entry.memberships,
    greeting,
    personName,
  });
  if (!hero) notFound();

  return (
    <TeamShell context={context}>
      <TeamHero payload={hero} />
    </TeamShell>
  );
}

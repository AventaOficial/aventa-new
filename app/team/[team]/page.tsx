import { notFound, redirect } from 'next/navigation';
import { buildTeamShellContext } from '@/lib/team/config/navigation';
import { mexicoCityHour, teamGreeting } from '@/lib/team/config/greeting';
import { buildTeamHeroPayload } from '@/lib/team/hero/build';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { roleHasPermission } from '@/lib/team/permissions/grants';
import { teamProgressAccess } from '@/lib/team/progression/access';
import { loadTeamProgress } from '@/lib/team/progression/read';
import { readTeamPersonName } from '@/lib/team/shell/profile';
import { isTeamId } from '@/lib/team/roles/teams';
import { ModerationWorkspace } from '../moderation/ModerationWorkspace';
import { TeamHero } from '../hero/TeamHero';
import { TeamProgressPanel } from '../progress/TeamProgressPanel';
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
  if (!context || context.navigation.length === 0) notFound();

  const [hero, progress] = await Promise.all([
    buildTeamHeroPayload({
      requestedTeam: entry.membership.teamId,
      memberships: entry.memberships,
      greeting,
      personName,
    }),
    teamProgressAccess(entry.membership) ? loadTeamProgress(entry.membership) : Promise.resolve(null),
  ]);
  if (!hero) notFound();

  const showModerationQueue =
    entry.membership.teamId === 'moderation' &&
    roleHasPermission(entry.membership.teamId, entry.membership.role, 'moderation.offers.read');

  return (
    <TeamShell context={context}>
      <TeamHero payload={hero} />
      {progress ? <TeamProgressPanel view={progress} /> : null}
      {showModerationQueue ? <ModerationWorkspace /> : null}
    </TeamShell>
  );
}

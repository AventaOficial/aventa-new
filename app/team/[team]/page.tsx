import { notFound, redirect } from 'next/navigation';
import { teamRoleLabel } from '@/lib/team/roles/catalog';
import { TEAM_LABELS, isTeamId } from '@/lib/team/roles/teams';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { TeamFrame } from '../frame';

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

  return (
    <TeamFrame title={TEAM_LABELS[entry.membership.teamId]}>
      <p className="text-sm text-[#424245] dark:text-[#a1a1a6]">
        {teamRoleLabel(entry.membership.teamId, entry.membership.role)}. El espacio de trabajo de este equipo llega en la
        siguiente fase.
      </p>
    </TeamFrame>
  );
}

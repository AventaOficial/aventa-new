import Link from 'next/link';
import { redirect } from 'next/navigation';
import { teamRoleLabel } from '@/lib/team/roles/catalog';
import { TEAM_LABELS } from '@/lib/team/roles/teams';
import { resolveTeamPage } from '@/lib/team/gate/require';
import { TeamFrame } from '../frame';

export default async function TeamSelectPage() {
  const entry = await resolveTeamPage(null);
  if (entry.kind === 'login' || entry.kind === 'gate') redirect('/team/gate?next=/team/select');
  if (entry.kind === 'no-access' || entry.kind === 'unavailable' || entry.kind === 'forbidden') {
    redirect('/team/no-access');
  }
  if (entry.kind !== 'select' || entry.memberships.length === 0) redirect('/team/no-access');

  return (
    <TeamFrame title="Elige tu área">
      <ul className="flex flex-col gap-3">
        {entry.memberships.map((membership) => (
          <li key={membership.teamId}>
            <Link
              href={`/team/${membership.teamId}`}
              className="flex items-center justify-between rounded-2xl border border-[#d2d2d7] bg-white px-4 py-4 dark:border-[#404040] dark:bg-[#141414]"
            >
              <span>
                <span className="block font-medium text-[#1d1d1f] dark:text-[#fafafa]">
                  {TEAM_LABELS[membership.teamId]}
                </span>
                <span className="mt-1 block text-sm text-[#737373]">{teamRoleLabel(membership.teamId, membership.role)}</span>
              </span>
              <span className="text-sm font-medium text-violet-600 dark:text-violet-400">Entrar</span>
            </Link>
          </li>
        ))}
      </ul>
    </TeamFrame>
  );
}

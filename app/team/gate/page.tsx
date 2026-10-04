import { redirect } from 'next/navigation';
import { resolveTeamNext } from '@/lib/team/gate/policy';
import { requireTeamGate } from '@/lib/team/gate/require';
import { readTeamActor } from '@/lib/team/gate/session';
import { TeamFrame } from '../frame';
import { TeamGateForm } from './TeamGateForm';

type Props = { searchParams: Promise<{ next?: string }> };

export default async function TeamGatePage({ searchParams }: Props) {
  const params = await searchParams;
  const next = resolveTeamNext(params.next);
  const actor = await readTeamActor();
  if (actor) {
    const gate = await requireTeamGate();
    if (gate.ok) redirect(next);
  }

  return (
    <TeamFrame title={actor ? 'Confirma tu identidad' : 'Iniciar sesión'}>
      <TeamGateForm mode={actor ? 'reauth' : 'login'} email={actor?.email ?? null} next={next} />
    </TeamFrame>
  );
}

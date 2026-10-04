'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Delta, Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

export default function CommunityTeam({ cmd }: { cmd: OwnerCommandPayload | null }) {
  const c = cmd?.community;
  const alerts: TeamAlert[] = [];
  if ((cmd?.plaza.pendingRequests ?? 0) > 0) {
    alerts.push({ tone: 'warn', text: `${cmd?.plaza.pendingRequests} solicitudes de Plaza esperan moderación (no hay cola admin dedicada).` });
  }
  alerts.push({ tone: 'info', text: '"Sin respuesta" aún no es medible: las solicitudes de Plaza no se vinculan con sus respuestas.' });

  const delta = (key: 'plazaRequests' | 'plazaDiscussions' | 'votes' | 'comments') =>
    c ? <Delta current={c[key].value} previous={c[key].previous} label={cmd?.range.prevLabel} /> : null;

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Solicitudes nuevas" provenance={c?.plazaRequests.value != null ? 'REAL' : 'UNAVAILABLE'} value={c?.plazaRequests.value != null ? formatCount(c.plazaRequests.value) : <Unavailable what="Solicitudes de Plaza no disponibles" />} footer={delta('plazaRequests')} hint="Solicitudes de Plaza creadas en el período." />
          <Metric label="Solicitudes activas" provenance={cmd?.plaza.approvedRequests != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.plaza.approvedRequests)} hint="Solicitudes aprobadas y visibles." />
          <Metric label="Pendientes de moderar" provenance={cmd?.plaza.pendingRequests != null ? 'REAL' : 'UNAVAILABLE'} value={formatCount(cmd?.plaza.pendingRequests)} hint="Solicitudes esperando revisión." />
          <Metric label="Sin respuesta" provenance="UNAVAILABLE" value={<Unavailable what="Requiere vincular respuestas u ofertas con las solicitudes" />} />
          <Metric label="Conversaciones" provenance={c?.plazaDiscussions.value != null ? 'REAL' : 'UNAVAILABLE'} value={c?.plazaDiscussions.value != null ? formatCount(c.plazaDiscussions.value) : <Unavailable what="Conversaciones no disponibles" />} footer={delta('plazaDiscussions')} hint="Conversaciones de Plaza iniciadas en el período." />
          <Metric label="Comentarios" provenance={c ? 'REAL' : 'UNAVAILABLE'} value={formatCount(c?.comments.value)} footer={delta('comments')} hint="Comentarios en ofertas del período." />
          <Metric label="Votos" provenance={c ? 'REAL' : 'UNAVAILABLE'} value={formatCount(c?.votes.value)} footer={delta('votes')} hint="Votos en ofertas del período." />
          <Metric label="Cazadores activos" provenance={c?.activeHunters.value != null ? 'CALCULATED' : 'UNAVAILABLE'} value={formatCount(c?.activeHunters.value)} hint="Personas distintas (sin bots) que publicaron ofertas en el período." />
        </>
      }
      alerts={alerts}
      ctas={[
        { href: '/plaza', label: 'Ver Plaza', primary: true },
        { href: '/admin/moderation/comments', label: 'Comentarios' },
        { href: '/admin/owner/cazadores', label: 'Cazadores' },
      ]}
    />
  );
}

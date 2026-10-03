'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Delta, Metric, Unavailable, formatCount } from '../ui';
import TeamBody, { type TeamAlert } from './TeamBody';

export default function CommunityTeam({ cmd }: { cmd: OwnerCommandPayload | null }) {
  const c = cmd?.community;
  const alerts: TeamAlert[] = [];
  if ((cmd?.plaza.pendingRequests ?? 0) > 0) {
    alerts.push({ tone: 'warn', text: `${cmd?.plaza.pendingRequests} solicitudes de Plaza esperan moderación y no hay cola admin dedicada en esta rama.` });
  }
  alerts.push({ tone: 'info', text: '"Sin respuesta" no es medible: plaza_requests no tiene relación de respuestas/ofertas vinculadas.' });

  const delta = (key: 'plazaRequests' | 'plazaDiscussions' | 'votes' | 'comments') =>
    c ? <Delta current={c[key].value} previous={c[key].previous} label={cmd?.range.prevLabel} /> : null;

  return (
    <TeamBody
      metrics={
        <>
          <Metric label="Solicitudes nuevas" provenance={c?.plazaRequests.value != null ? 'REAL' : 'UNKNOWN'} value={c?.plazaRequests.value != null ? formatCount(c.plazaRequests.value) : <Unavailable what="plaza_requests no disponible" />} footer={delta('plazaRequests')} hint="plaza_requests.created_at" />
          <Metric label="Solicitudes activas" provenance={cmd?.plaza.approvedRequests != null ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.plaza.approvedRequests)} hint="plaza_requests.status = approved (visibles)" />
          <Metric label="Pendientes de moderar" provenance={cmd?.plaza.pendingRequests != null ? 'REAL' : 'UNKNOWN'} value={formatCount(cmd?.plaza.pendingRequests)} hint="plaza_requests.status = pending" />
          <Metric label="Sin respuesta" provenance="UNKNOWN" value={<Unavailable what="Requiere vincular respuestas u ofertas a plaza_requests" />} />
          <Metric label="Conversaciones" provenance={c?.plazaDiscussions.value != null ? 'REAL' : 'UNKNOWN'} value={c?.plazaDiscussions.value != null ? formatCount(c.plazaDiscussions.value) : <Unavailable what="plaza_discussions no disponible" />} footer={delta('plazaDiscussions')} hint="plaza_discussions.created_at" />
          <Metric label="Comentarios" provenance={c ? 'REAL' : 'UNKNOWN'} value={formatCount(c?.comments.value)} footer={delta('comments')} hint="comments.created_at" />
          <Metric label="Votos" provenance={c ? 'REAL' : 'UNKNOWN'} value={formatCount(c?.votes.value)} footer={delta('votes')} hint="offer_votes.created_at" />
          <Metric label="Cazadores activos" provenance={c?.activeHunters.value != null ? 'DERIVED' : 'UNKNOWN'} value={formatCount(c?.activeHunters.value)} hint="Autores humanos distintos con ofertas en el período" />
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

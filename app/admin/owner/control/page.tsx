import { EDITORIAL_CANON } from '@/lib/product/hunters/canon';
import { SPONSORED_CAMPAIGNS } from '@/lib/sponsored/campaigns';
import { sponsoredDisclosure } from '@/lib/sponsored/placements';
import ControlCenterClient from './ControlCenterClient';
import { readOwnerControlStorage } from '@/lib/control/ownerView';

export default async function OwnerControlPage() {
  const storage = await readOwnerControlStorage();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 text-white">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">Administración</p>
        <h1 className="mt-2 text-2xl font-semibold">Centro de control</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/60">
          Configuración ordinaria por dominio. Los secretos, la autorización y el congelamiento de dinero no se editan aquí.
          Lo que ves de hunters y campañas en código es la configuración desplegada, distinta de un registro guardado en base.
        </p>
      </header>

      <ControlCenterClient storage={storage} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold">Hunters en el canon</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/55">
          Esta lista sale del código desplegado. Guardar un agente futuro no cambia todavía el runtime de los workers.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {EDITORIAL_CANON.map((hunter) => (
            <li key={hunter.code} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
              <span className="font-medium">{hunter.displayName}</span>
              <span className="mt-0.5 block text-xs text-white/45">{hunter.code} · {hunter.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold">Campañas en código</h2>
        <ul className="mt-3 space-y-2">
          {SPONSORED_CAMPAIGNS.map((campaign) => (
            <li key={campaign.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
              <span className="text-[11px] uppercase tracking-wide text-violet-300">{sponsoredDisclosure(campaign.kind)}</span>
              <span className="mt-1 block">{campaign.creative.title}</span>
              <span className="text-xs text-white/45">{campaign.store} · {campaign.active ? 'activa en código' : 'inactiva'}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

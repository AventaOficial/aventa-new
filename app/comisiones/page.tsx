import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/app/AppShell';
import LegalBackLink from '@/app/components/LegalBackLink';
import { PRIVACY_LAST_UPDATED } from '@/lib/legal/constants';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_PAYOUT_CENTS,
  REWARDS_REQUIRED_APPROVED_OFFERS,
  REWARDS_REQUIRED_POSITIVE_VOTES,
} from '@/lib/rewards/config';
import {
  AFFILIATE_DISCLOSURE_ES,
  AMAZON_ASSOCIATES_DISCLOSURE,
} from '@/lib/commissions/programStatus';
import { Shield, Wallet, AlertTriangle, Scale, ArrowRight, Sparkles, Gift } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Programa de Recompensas | AVENTA',
  description:
    'Cómo funciona el Programa de Recompensas de AVENTA: calidad, split 40/60, Oferta de Bienvenida, hold de 60 días y anti-fraude. Sin garantía de ingresos.',
  openGraph: {
    title: 'Programa de Recompensas | AVENTA',
    description:
      'AVENTA puede otorgar recompensas internas a cazadores elegibles cuando sus ofertas generan comisiones reales atribuibles.',
  },
};

function mxnFromCents(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function ComisionesPage() {
  const creatorSharePct = (REWARDS_CREATOR_SHARE_BPS / 100).toFixed(0);
  const minPayout = mxnFromCents(REWARDS_MIN_PAYOUT_CENTS);

  return (
    <AppShell>
    <main className="min-h-screen pb-24 md:pb-0 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-8 md:pt-12 pb-16 space-y-10">
        <LegalBackLink />
        <header className="space-y-4">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA · Cazadores
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Programa de Recompensas
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
            AVENTA es una comunidad de ofertas. Cuando alguien compra a través de un enlace de
            afiliado de <strong>AVENTA</strong> (Amazon, Mercado Libre u otras tiendas), la
            plataforma puede recibir una comisión de la red. Una parte puede convertirse en{' '}
            <strong>recompensa interna</strong> para cazadores elegibles cuyas ofertas generaron
            esa comisión de forma atribuible.
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300 leading-relaxed border-l-2 border-amber-400 pl-3 bg-amber-50/60 dark:bg-amber-950/20 py-2 rounded-r-lg">
            <strong>Importante:</strong> el Programa de Recompensas{' '}
            <strong>no está activo públicamente</strong> en este momento. Puedes acumular
            progreso en tu perfil, pero no hay pagos ni recompensas monetarias hasta que AVENTA
            lo anuncie oficialmente. Las recompensas <strong>nunca están garantizadas</strong>.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed border-l-2 border-violet-400 pl-3">
            El creador de una oferta <strong>no es afiliado</strong> de Amazon ni Mercado Libre.
            AVENTA utiliza sus propios enlaces de afiliación. El listado de ofertas{' '}
            <strong>nunca se vende</strong>: el orden sigue siendo por votos de la comunidad.
          </p>
        </header>

        <section className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-[#141414] p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-semibold">Cómo funciona, en cinco pasos</h2>
          </div>
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong className="text-gray-900 dark:text-gray-100">1. Publicas ofertas reales.</strong>{' '}
              La comunidad las vota. Solo cuentan las aprobadas o publicadas.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">2. Desbloqueas el programa.</strong>{' '}
              Necesitas {REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas y{' '}
              {REWARDS_REQUIRED_POSITIVE_VOTES} votos positivos acumulados (suma entre todas tus
              ofertas). Los votos miden calidad; no generan dinero por sí solos.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">3. Eliges tu Oferta de Bienvenida.</strong>{' '}
              Una sola vez, seleccionas una oferta entre tus primeras {REWARDS_REQUIRED_APPROVED_OFFERS}.
              También participan las ofertas elegibles que publiques después del desbloqueo.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">4. Comisión real y atribución.</strong>{' '}
              AVENTA usa sus enlaces de afiliado. Si alguien compra desde una oferta participante y
              la red confirma una comisión atribuible, AVENTA puede registrar una recompensa interna.
              En Mercado Libre la atribución puede requerir revisión manual.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">5. Recompensa (cuando el programa esté activo).</strong>{' '}
              Del ingreso afiliado confirmado y atribuible, el creador elegible puede recibir
              aproximadamente el {creatorSharePct}% como recompensa, tras validación de{' '}
              {REWARDS_HOLD_DAYS} días y mínimo de {minPayout}. No es un ingreso garantizado.
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-lg font-semibold">Ejemplo numérico (ilustrativo)</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Imagina que una oferta tuya participante genera <strong>$83.40 MXN</strong> de
            comisión afiliada confirmada y atribuible a AVENTA:
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">Comisión de red (AVENTA)</p>
              <p className="text-lg font-bold tabular-nums">$83.40</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">Recompensa cazador ({creatorSharePct}%)</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">$33.36</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">AVENTA ({100 - Number(creatorSharePct)}%)</p>
              <p className="text-lg font-bold tabular-nums">$50.04</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Este ejemplo es hipotético. Sin comisión confirmada y atribuible, no hay recompensa.
            Los votos y clics ayudan al desbloqueo y la calidad, pero no sustituyen una comisión real.
          </p>
        </section>

        <section className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">Oferta de Bienvenida y participación</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Tras desbloquear, eliges <strong>una única</strong> Oferta de Bienvenida entre tus
              primeras {REWARDS_REQUIRED_APPROVED_OFFERS} ofertas aprobadas.
            </li>
            <li>
              Participan en recompensas: la Oferta de Bienvenida + ofertas elegibles publicadas{' '}
              <strong>después</strong> del desbloqueo.
            </li>
            <li>
              Las demás ofertas de tus primeras {REWARDS_REQUIRED_APPROVED_OFFERS} (excepto la
              Welcome) <strong>no participan</strong> en recompensas.
            </li>
            <li>
              Publicar una oferta o recibir votos <strong>no garantiza</strong> recompensa
              monetaria.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            <h2 className="text-lg font-semibold">Validación, hold y pago</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              Hold orientativo de <strong>{REWARDS_HOLD_DAYS} días</strong> antes de que una
              recompensa quede disponible (absorber devoluciones/chargebacks).
            </li>
            <li>
              Mínimo de transferencia orientativo: <strong>{minPayout}</strong> (puede acumularse).
            </li>
            <li>
              Estados posibles: validación, disponible, pagada, cancelada o revertida según
              fraude, devoluciones o atribución.
            </li>
            <li>
              Cuando el programa esté activo, los pagos serán <strong>manuales</strong> tras
              revisión administrativa. AVENTA puede solicitar datos fiscales/bancarios antes de pagar.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            <h2 className="text-lg font-semibold">Protección anti-fraude</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Prohibido auto-voto, auto-compra y manipulación de métricas.</li>
            <li>AVENTA puede cancelar o revertir recompensas ante fraude o abuso.</li>
            <li>Ofertas con votos artificiales pueden excluirse del programa.</li>
            <li>Un RFC solo puede registrarse en una cuenta cuando se soliciten pagos.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <h2 className="text-lg font-semibold">Transparencia de afiliados</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">{AFFILIATE_DISCLOSURE_ES}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 italic border-l-2 border-gray-300 dark:border-gray-600 pl-3">
            {AMAZON_ASSOCIATES_DISCLOSURE}
          </p>
        </section>

        <section className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50/40 dark:bg-red-950/20 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold">Importante</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Las recompensas dependen de comisiones reales de redes externas, atribución válida,
            ausencia de fraude y activación oficial del programa. Los pagos futuros pueden generar
            obligaciones fiscales para el receptor. Dudas legales o de privacidad:{' '}
            <a
              href="mailto:aventasoportelegal@gmail.com"
              className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              aventasoportelegal@gmail.com
            </a>
            . Política de privacidad actualizada: {PRIVACY_LAST_UPDATED}.
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/me"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 text-sm font-semibold transition-colors"
          >
            Ver mi progreso
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/terms#comisiones"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            Leer términos completos
          </Link>
        </div>
      </div>
    </main>
    </AppShell>
  );
}

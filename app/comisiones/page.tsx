import type { Metadata } from 'next';
import Link from 'next/link';
import {
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_REQUIRED_OFFERS,
} from '@/lib/commissions/constants';
import {
  AFFILIATE_DISCLOSURE_ES,
  AMAZON_ASSOCIATES_DISCLOSURE,
} from '@/lib/commissions/programStatus';
import { Shield, Wallet, CheckCircle2, AlertTriangle, Scale, ArrowRight, Sparkles } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Programa de comisiones para cazadores',
  description:
    'Cómo funciona el programa de comisiones de AVENTA: calidad, split 40/60, ejemplo numérico, requisitos fiscales y anti-fraude. Formal, claro y transparente.',
  openGraph: {
    title: 'Programa de comisiones | AVENTA',
    description:
      'Cazadores de calidad pueden recibir el 40% de las comisiones afiliadas confirmadas. El ranking nunca se vende.',
  },
};

export default function ComisionesPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-4">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA · Cazadores
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Programa de comisiones para cazadores
          </h1>
          <p className="text-base text-gray-600 dark:text-gray-400 leading-relaxed">
            AVENTA es una comunidad de ofertas. Cuando alguien compra a través de un enlace de afiliado
            (Amazon, Mercado Libre u otras tiendas), la plataforma puede recibir una comisión. Una parte
            de esa comisión se reparte con los cazadores que demuestran <strong>calidad sostenida</strong> y
            generan ingresos atribuibles reales.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed border-l-2 border-violet-400 pl-3">
            El listado de ofertas <strong>nunca se vende</strong>. El orden sigue siendo por votos de la
            comunidad, no por quien paga más.
          </p>
        </header>

        <section className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-[#141414] p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-semibold">Cómo funciona, en cuatro pasos</h2>
          </div>
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong className="text-gray-900 dark:text-gray-100">1. Publicas ofertas reales.</strong> La
              comunidad las vota. Solo cuentan las aprobadas o publicadas.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">2. Desbloqueas el programa.</strong> Necesitas{' '}
              {COMMISSION_REQUIRED_OFFERS} ofertas tuyas con al menos {COMMISSION_MIN_UPVOTES_PER_OFFER} votos
              positivos cada una, más datos fiscales y aceptación de términos.
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">3. Tus ofertas generan comisión.</strong>{' '}
              AVENTA usa sus propios enlaces de afiliado. Si alguien compra desde una oferta tuya y la red
              confirma el pago, esa comisión se te atribuye por la oferta (no necesitas un código personal).
            </li>
            <li>
              <strong className="text-gray-900 dark:text-gray-100">4. Cobras el 40%.</strong> Del ingreso
              afiliado confirmado y atribuible a ti, tú recibes el 40% y AVENTA retiene el 60% (operación,
              impuestos, chargebacks y producto).
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 md:p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            <h2 className="text-lg font-semibold">Ejemplo numérico (ilustrativo)</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Imagina que una oferta tuya genera <strong>$83.40 MXN</strong> de comisión afiliada confirmada
            y atribuible a ti:
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">Comisión total</p>
              <p className="text-lg font-bold tabular-nums">$83.40</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">Cazador (40%)</p>
              <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">$33.36</p>
            </div>
            <div className="rounded-xl bg-white dark:bg-[#0f0f0f] border border-emerald-100 dark:border-emerald-900/40 p-3">
              <p className="text-xs text-gray-500 mb-1">AVENTA (60%)</p>
              <p className="text-lg font-bold tabular-nums">$50.04</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Quien genera más comisión confirmada cobra más. No se reparte un “bote mensual entre todos” por
            votos. Los votos abren la puerta al programa; el dinero lo define la comisión real de la red.
          </p>
        </section>

        <section className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">¿Quién puede participar?</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>{COMMISSION_REQUIRED_OFFERS} ofertas</strong> aprobadas o publicadas por ti.
            </li>
            <li>
              Cada una con al menos <strong>{COMMISSION_MIN_UPVOTES_PER_OFFER} votos positivos</strong> (calidad,
              no volumen vacío).
            </li>
            <li>Datos fiscales válidos: nombre legal y RFC (CLABE recomendada para transferencia SPEI).</li>
            <li>
              Aceptación explícita de la sección 8 de los{' '}
              <Link href="/terms" className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
                Términos y Condiciones
              </Link>
              .
            </li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            El programa solo paga cuando AVENTA lo activa oficialmente (
            <code className="text-[11px]">COMMISSION_PROGRAM_ACTIVE</code>). Mientras tanto puedes preparar
            perfil y progreso en{' '}
            <Link href="/me" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              Mi perfil
            </Link>
            .
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gray-600 dark:text-gray-300" />
            <h2 className="text-lg font-semibold">Cómo se calcula y se paga</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            AVENTA importa o registra las comisiones confirmadas por las redes (ledger). Luego genera un
            cierre mensual: solo entran montos <strong>atribuibles a tus ofertas</strong> (quién publicó y
            desde dónde se hizo el clic). Se aplica el 40%, un mínimo de transferencia (hoy $200 MXN; si no
            se alcanza, se acumula) y una retención de días por posibles devoluciones de la red. El pago es{' '}
            <strong>manual</strong> tras revisión administrativa.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            No hace falta que cada cazador tenga un tag propio de Amazon o Mercado Libre. AVENTA opera con
            sus enlaces de afiliado y reparte por atribución interna. Un código personal solo se usa en casos
            especiales.
          </p>
        </section>

        <section className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/15 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-700 dark:text-amber-400" />
            <h2 className="text-lg font-semibold">Protección anti-fraude</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>Un RFC solo puede registrarse en <strong>una cuenta</strong> de AVENTA.</li>
            <li>Validación de formato RFC y dígito verificador de CLABE.</li>
            <li>Checklist obligatorio antes de marcar un pago como liquidado.</li>
            <li>Ofertas con votos artificiales o abuso pueden excluirse del reparto.</li>
            <li>AVENTA puede retener o anular pagos ante fraude o incumplimiento de términos.</li>
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
            <h2 className="text-lg font-semibold">Importante (México)</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Los pagos pueden generar obligaciones fiscales para el receptor (retenciones, facturación o
            declaraciones según tu régimen). AVENTA solicitará datos fiscales antes de activar cobros. Dudas
            legales o de privacidad:{' '}
            <a
              href="mailto:aventasoportelegal@gmail.com"
              className="font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              aventasoportelegal@gmail.com
            </a>
            .
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
            href="/terms"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            Leer términos completos
          </Link>
        </div>
      </div>
    </main>
  );
}

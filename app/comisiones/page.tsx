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
import { Shield, Wallet, CheckCircle2, AlertTriangle, Scale } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Programa de comisiones | AVENTA',
  description:
    'Cómo funciona el reparto de comisiones para cazadores de confianza en AVENTA: requisitos, datos fiscales y protección anti-fraude.',
};

export default function ComisionesPage() {
  return (
    <main className="min-h-screen pb-24 md:pb-0 md:pl-28 bg-[#F5F5F7] dark:bg-[#0a0a0a] text-[#111827] dark:text-[#F9FAFB]">
      <div className="mx-auto max-w-3xl px-4 pt-24 md:pt-28 pb-16 space-y-10">
        <header className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-violet-600 dark:text-violet-400">
            AVENTA
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Programa de comisiones para cazadores
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            AVENTA puede recibir ingresos por enlaces de afiliados (Amazon, Mercado Libre y otras tiendas).
            Una parte se reparte entre cazadores que demuestran impacto real en la comunidad. El ranking de
            ofertas <strong>nunca</strong> se vende: sigue siendo por votos.
          </p>
        </header>

        <section className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">¿Quién puede participar?</h2>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>{COMMISSION_REQUIRED_OFFERS} ofertas</strong> aprobadas o publicadas por ti.
            </li>
            <li>
              Cada oferta debe tener al menos <strong>{COMMISSION_MIN_UPVOTES_PER_OFFER} votos positivos</strong>{' '}
              (no basta subir muchas ofertas con pocos votos).
            </li>
            <li>
              Datos fiscales válidos: nombre legal y RFC (CLABE recomendada para transferencia).
            </li>
            <li>
              Aceptación explícita de la sección 8 de los{' '}
              <Link href="/terms" className="text-violet-600 dark:text-violet-400 font-semibold hover:underline">
                Términos y Condiciones
              </Link>
              .
            </li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            El programa solo se activa cuando AVENTA lo anuncia oficialmente. Hasta entonces puedes preparar tu perfil en{' '}
            <Link href="/me" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              Mi perfil
            </Link>
            .
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold">Cómo se reparte</h2>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Cada mes, AVENTA calcula un pool a partir de comisiones de afiliados registradas en el ledger interno.
            El reparto entre cazadores elegibles es proporcional a los puntos de sus ofertas calificadas (votos en
            ofertas que cumplen el umbral). Los pagos son <strong>manuales</strong> tras revisión administrativa — no hay
            retiro automático instantáneo.
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
            <li>Checklist obligatorio antes de marcar un pago como liquidado en admin.</li>
            <li>Ofertas con votos artificiales o abuso pueden excluirse del reparto (ver Términos).</li>
            <li>AVENTA puede retener o anular pagos ante señales de fraude o incumplimiento.</li>
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#141414] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Transparencia de afiliados</h2>
          </div>
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
            Los pagos pueden generar obligaciones fiscales para el receptor (retenciones, facturación o declaraciones según
            tu régimen). AVENTA te pedirá datos fiscales antes de activar el programa. Para dudas legales o de privacidad:{' '}
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
            className="inline-flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 text-sm"
          >
            Ver mi progreso
          </Link>
          <Link
            href="/terms"
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 dark:border-gray-600 px-5 py-2.5 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-[#1a1a1a]"
          >
            Leer términos completos
          </Link>
        </div>
      </div>
    </main>
  );
}

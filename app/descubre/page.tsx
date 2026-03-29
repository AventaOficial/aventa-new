'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';
import {
  Mail,
  Bell,
  Heart,
  Shield,
  Sparkles,
  Users2,
  PlusCircle,
  LayoutGrid,
  UserRound,
  Smartphone,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react';

type DescubreBlock = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const BLOCKS: DescubreBlock[] = [
  {
    id: 'inicio-ranking',
    icon: Sparkles,
    title: 'Inicio y ranking',
    body: (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          En la página principal eliges cómo ver las ofertas: <strong>Día a día</strong>, <strong>Top</strong>,{' '}
          <strong>Para ti</strong> (según tus gustos) o <strong>Últimas</strong>. Vota para que suban o bajen en el
          ranking.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Ir al inicio
        </Link>
      </>
    ),
  },
  {
    id: 'subir',
    icon: PlusCircle,
    title: 'Subir ofertas',
    body: (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Usa el botón <strong className="text-gray-800 dark:text-gray-200">+</strong> en la barra inferior (móvil) o
          en el lateral (escritorio). Puedes pegar el enlace de la tienda: intentamos rellenar título, imagen y nombre
          de tienda. Las ofertas nuevas pasan por moderación salvo que tengas reputación alta (auto-aprobación).
        </p>
        <Link
          href="/subir"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Abrir subir oferta
        </Link>
      </>
    ),
  },
  {
    id: 'categorias',
    icon: LayoutGrid,
    title: 'Categorías, tiendas y comunidades',
    body: (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Explora por categoría (macro: Tecnología, Gaming, Hogar, etc.), por tienda concreta, o entra en comunidades
          por tema.
        </p>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>
            <Link href="/categoria/tecnologia" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Categoría Tecnología
            </Link>
            <span className="text-gray-500 dark:text-gray-500"> — también hay gaming, hogar, moda…</span>
          </li>
          <li>
            <Link href="/categoria/gaming" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Categoría Gaming
            </Link>
          </li>
          <li>
            <Link href="/tienda/amazon" className="font-medium text-violet-600 dark:text-violet-400 hover:underline">
              Ofertas por tienda (ej. Amazon)
            </Link>
            <span className="text-gray-500 dark:text-gray-500"> — el slug cambia según la tienda.</span>
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'perfil',
    icon: UserRound,
    title: 'Tu perfil público',
    body: (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Cada usuario tiene una URL pública del tipo <strong>/u/tu-nombre</strong> para compartir tu actividad. Configura
        nombre y avatar desde Configuración.
      </p>
    ),
  },
  {
    id: 'comentarios',
    icon: Users2,
    title: 'Comentarios y reportes',
    body: (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Puedes comentar en ofertas (con moderación de comentarios) y reportar contenido que no cumpla las normas. Ayudas
        a mantener la calidad de la comunidad.
      </p>
    ),
  },
  {
    id: 'correo',
    icon: Mail,
    title: 'Resúmenes en tu correo',
    body: (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Activa en <strong>Configuración</strong> el resumen diario (Top 10 del día) y/o el resumen semanal (más
          comentadas y mejor votadas).
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          Ir a Configuración
        </Link>
      </>
    ),
  },
  {
    id: 'notificaciones',
    icon: Bell,
    title: 'Notificaciones y avisos',
    body: (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        La campana en la barra agrupa avisos de ofertas y del equipo. Esta guía también está en el{' '}
        <strong>menú de tu foto de perfil</strong> → «Descubre AVENTA».
      </p>
    ),
  },
  {
    id: 'favoritos',
    icon: Heart,
    title: 'Favoritos y tu espacio',
    body: (
      <>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Guarda ofertas en favoritos, revisa <strong>Mis ofertas</strong> y tu actividad. El nombre visible se puede
          cambiar cada 14 días desde Configuración.
        </p>
        <div className="flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/me" className="text-violet-600 dark:text-violet-400 hover:underline">
            Mis ofertas
          </Link>
          <Link href="/me/favorites" className="text-violet-600 dark:text-violet-400 hover:underline">
            Favoritos
          </Link>
        </div>
      </>
    ),
  },
  {
    id: 'pwa',
    icon: Smartphone,
    title: 'App en el móvil (PWA)',
    body: (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Puedes <strong>añadir AVENTA a la pantalla de inicio</strong>: en Android suele ofrecerse «Instalar app»; en
        iPhone, compartir → «Añadir a pantalla de inicio».
      </p>
    ),
  },
  {
    id: 'moderacion',
    icon: Shield,
    title: 'Moderación y calidad',
    body: (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Las ofertas pasan por moderación antes de publicarse (salvo auto-aprobación por reputación). El ranking combina
        votos y reputación; entre todos mantenemos la calidad.
      </p>
    ),
  },
];

const navBtnClass =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200/90 dark:border-gray-600/80 bg-white/95 dark:bg-gray-900/95 text-gray-700 dark:text-gray-200 shadow-md backdrop-blur-sm transition-all hover:border-violet-300 dark:hover:border-violet-600 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-35 disabled:pointer-events-none active:scale-95';

function VerticalDescubreNav({
  count,
  activeIndex,
  onPrev,
  onNext,
}: {
  count: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="flex flex-col items-center gap-2"
      role="navigation"
      aria-label="Navegación entre secciones de la guía"
    >
      <button type="button" className={navBtnClass} onClick={onPrev} disabled={activeIndex <= 0} aria-label="Sección anterior">
        <ChevronUp className="h-5 w-5" strokeWidth={2.25} />
      </button>
      <span className="select-none rounded-full bg-gray-100/90 dark:bg-gray-800/90 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-gray-600 dark:text-gray-400 border border-gray-200/80 dark:border-gray-700">
        {activeIndex + 1} / {count}
      </span>
      <button
        type="button"
        className={navBtnClass}
        onClick={onNext}
        disabled={activeIndex >= count - 1}
        aria-label="Siguiente sección"
      >
        <ChevronDown className="h-5 w-5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

function DescubrePageInner() {
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const n = BLOCKS.length;

  const scrollToIndex = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(n - 1, i));
    const el = sectionRefs.current[clamped];
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [n]);

  useEffect(() => {
    const nodes = sectionRefs.current.filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target) return;
        const idx = nodes.indexOf(visible.target as HTMLElement);
        if (idx >= 0) setActiveIndex(idx);
      },
      { root: null, rootMargin: '-20% 0px -45% 0px', threshold: [0, 0.15, 0.35, 0.55] }
    );

    for (const el of nodes) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent relative">
        {/* Escritorio / tablet: columna fija centrada en altura, borde derecho */}
        <div className="pointer-events-none fixed inset-y-0 right-0 z-40 hidden sm:flex sm:w-16 md:w-20 items-center justify-center">
          <div className="pointer-events-auto pr-2 md:pr-4">
            <VerticalDescubreNav
              count={n}
              activeIndex={activeIndex}
              onPrev={() => scrollToIndex(activeIndex - 1)}
              onNext={() => scrollToIndex(activeIndex + 1)}
            />
          </div>
        </div>

        {/* Móvil: misma columna vertical, abajo a la derecha (encima de la barra inferior típica) */}
        <div className="pointer-events-none fixed bottom-24 right-3 z-40 sm:hidden">
          <div className="pointer-events-auto">
            <VerticalDescubreNav
              count={n}
              activeIndex={activeIndex}
              onPrev={() => scrollToIndex(activeIndex - 1)}
              onNext={() => scrollToIndex(activeIndex + 1)}
            />
          </div>
        </div>

        <div className="mx-auto max-w-2xl px-4 py-8 md:py-12 sm:pr-14 md:pr-16">
          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-2">
            Descubre AVENTA
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Las mejores ofertas, elegidas por la comunidad. Aquí tienes un mapa de lo que puedes hacer en la web y la
            app. Usa las flechas al costado para ir de una sección a otra.
          </p>

          <div className="space-y-6">
            {BLOCKS.map((block, index) => {
              const Icon = block.icon;
              return (
                <section
                  key={block.id}
                  id={`descubre-${block.id}`}
                  ref={(el) => {
                    sectionRefs.current[index] = el;
                  }}
                  className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 md:p-6 scroll-mt-24 md:scroll-mt-28"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                      <Icon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <h2 className="font-semibold text-gray-900 dark:text-gray-100">{block.title}</h2>
                  </div>
                  {block.body}

                  <div className="mt-5 flex flex-col items-stretch gap-2 border-t border-gray-100 dark:border-gray-800 pt-4 sm:hidden">
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => scrollToIndex(index - 1)}
                        disabled={index <= 0}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-40"
                      >
                        <ChevronUp className="h-4 w-4" />
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollToIndex(index + 1)}
                        disabled={index >= n - 1}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/80 dark:bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-700 dark:text-violet-300 disabled:opacity-40"
                      >
                        Siguiente
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 hidden sm:flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => scrollToIndex(index - 1)}
                      disabled={index <= 0}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:hover:text-gray-500"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollToIndex(index + 1)}
                      disabled={index >= n - 1}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      Siguiente
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </section>
              );
            })}
          </div>

          <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-500">
            <Link href="/" className="text-violet-600 dark:text-violet-400 hover:underline">
              Volver al inicio
            </Link>
          </p>
        </div>
      </div>
    </ClientLayout>
  );
}

export default function DescubrePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
        </div>
      }
    >
      <DescubrePageInner />
    </Suspense>
  );
}

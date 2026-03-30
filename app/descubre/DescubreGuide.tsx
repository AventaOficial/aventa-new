'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
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
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';

/** Curva tipo “premium” (aprox. ease-out suave). */
const EASE = [0.22, 1, 0.36, 1] as const;
const DURATION = 0.35;

const slideVariants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? 48 : -48,
    opacity: 0,
    scale: 0.96,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? -36 : 36,
    opacity: 0,
    scale: 0.98,
  }),
};

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
        <p className="mb-2">
          En la página principal eliges cómo ver las ofertas: <strong>Día a día</strong>, <strong>Top</strong>,{' '}
          <strong>Para ti</strong> (según tus gustos) o <strong>Últimas</strong>. Vota para que suban o bajen en el
          ranking.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 transition-colors"
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
        <p className="mb-2">
          Usa el botón <strong className="text-gray-800 dark:text-gray-100">+</strong> en la barra inferior (móvil) o
          en el lateral (escritorio). Puedes pegar el enlace de la tienda: intentamos rellenar título, imagen y nombre
          de tienda. Las ofertas nuevas pasan por moderación salvo que tengas reputación alta (auto-aprobación).
        </p>
        <Link
          href="/subir"
          className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 transition-colors"
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
        <p className="mb-2">
          Explora por categoría (macro: Tecnología, Gaming, Hogar, etc.), por tienda concreta, o entra en comunidades
          por tema.
        </p>
        <ul className="space-y-2 text-[15px]">
          <li>
            <Link href="/categoria/tecnologia" className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
              Categoría Tecnología
            </Link>
            <span className="text-gray-500 dark:text-gray-500"> — también hay gaming, hogar, moda…</span>
          </li>
          <li>
            <Link href="/categoria/gaming" className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
              Categoría Gaming
            </Link>
          </li>
          <li>
            <Link href="/tienda/amazon" className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
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
      <p>
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
      <p>
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
        <p className="mb-2">
          Activa en <strong>Configuración</strong> el resumen diario (Top 10 del día) y/o el resumen semanal (más
          comentadas y mejor votadas).
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 transition-colors"
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
      <p>
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
        <p className="mb-2">
          Guarda ofertas en favoritos, revisa <strong>Mis ofertas</strong> y tu actividad. El nombre visible se puede
          cambiar cada 14 días desde Configuración.
        </p>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/me" className="text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
            Mis ofertas
          </Link>
          <Link href="/me/favorites" className="text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors">
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
      <p>
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
      <p>
        Las ofertas pasan por moderación antes de publicarse (salvo auto-aprobación por reputación). El ranking combina
        votos y reputación; entre todos mantenemos la calidad.
      </p>
    ),
  },
];

const CONTENT_MIN_H = 'min-h-[min(52vh,380px)]';

function DescubreProgress({
  count,
  activeIndex,
  onDotClick,
}: {
  count: number;
  activeIndex: number;
  onDotClick: (i: number) => void;
}) {
  return (
    <div className="w-full space-y-3">
      <div
        className="relative h-1 w-full overflow-hidden rounded-full bg-gray-200/80 dark:bg-gray-700/80"
        role="progressbar"
        aria-valuenow={activeIndex + 1}
        aria-valuemin={1}
        aria-valuemax={count}
        aria-label={`Paso ${activeIndex + 1} de ${count}`}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-violet-600"
          initial={false}
          animate={{ width: `${((activeIndex + 1) / count) * 100}%` }}
          transition={{ duration: DURATION, ease: EASE }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {Array.from({ length: count }).map((_, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onDotClick(i)}
              className="relative flex h-8 min-w-[2rem] items-center justify-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
              aria-label={`Ir al paso ${i + 1}`}
              aria-current={active ? 'step' : undefined}
            >
              <motion.span
                className="rounded-full bg-gray-300 dark:bg-gray-600"
                animate={{
                  width: active ? 24 : 8,
                  height: 8,
                  opacity: active ? 1 : 0.4,
                }}
                transition={{ duration: 0.28, ease: EASE }}
              />
              {active && (
                <motion.span
                  layoutId="descubre-progress-glow"
                  className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-violet-500/20 dark:bg-violet-400/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navFabClass =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-200/90 dark:border-gray-600/70 bg-white/90 dark:bg-gray-900/90 text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur-md transition-shadow hover:shadow-md hover:border-violet-300/80 dark:hover:border-violet-600/50 disabled:opacity-30 disabled:pointer-events-none disabled:shadow-none';

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
      className="flex flex-col items-center gap-3 rounded-3xl border border-gray-200/60 dark:border-gray-700/60 bg-white/70 dark:bg-gray-900/70 p-2 shadow-lg shadow-gray-900/5 dark:shadow-black/40 backdrop-blur-xl"
      role="navigation"
      aria-label="Navegación entre secciones de la guía"
    >
      <motion.button
        type="button"
        className={navFabClass}
        onClick={onPrev}
        disabled={activeIndex <= 0}
        aria-label="Sección anterior"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <ChevronUp className="h-5 w-5" strokeWidth={2.25} />
      </motion.button>
      <span className="select-none text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 tabular-nums">
        {activeIndex + 1}/{count}
      </span>
      <motion.button
        type="button"
        className={navFabClass}
        onClick={onNext}
        disabled={activeIndex >= count - 1}
        aria-label="Siguiente sección"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <ChevronDown className="h-5 w-5" strokeWidth={2.25} />
      </motion.button>
    </div>
  );
}

type StepState = { index: number; dir: number };

export default function DescubreGuide() {
  const n = BLOCKS.length;
  const [step, setStep] = useState<StepState>({ index: 0, dir: 0 });

  const goToIndex = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(n - 1, target));
      setStep((s) => {
        if (clamped === s.index) return s;
        const dir = clamped > s.index ? 1 : -1;
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `#descubre-${BLOCKS[clamped].id}`);
        }
        return { index: clamped, dir };
      });
    },
    [n]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw.startsWith('descubre-')) return;
    const idx = BLOCKS.findIndex((b) => `descubre-${b.id}` === raw);
    if (idx >= 0) setStep({ index: idx, dir: 0 });
  }, []);

  const { index: activeIndex, dir } = step;
  const indexRef = useRef(activeIndex);
  indexRef.current = activeIndex;

  const onPrev = () => goToIndex(activeIndex - 1);
  const onNext = () => goToIndex(activeIndex + 1);

  const block = BLOCKS[activeIndex];
  const Icon = block.icon;

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const i = indexRef.current;
    const threshold = 56;
    if (info.offset.x < -threshold || info.velocity.x < -320) {
      goToIndex(i + 1);
    } else if (info.offset.x > threshold || info.velocity.x > 320) {
      goToIndex(i - 1);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent relative">
      <div className="pointer-events-none fixed bottom-24 right-3 z-40 sm:hidden">
        <div className="pointer-events-auto">
          <VerticalDescubreNav count={n} activeIndex={activeIndex} onPrev={onPrev} onNext={onNext} />
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 md:py-10 sm:pr-14 md:pr-16">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="mb-5 text-center sm:text-left"
        >
          <h1 className="text-2xl md:text-[1.75rem] font-bold tracking-tight text-[#1d1d1f] dark:text-gray-50">
            Descubre AVENTA
          </h1>
          <p className="mt-2 max-w-xl mx-auto sm:mx-0 text-[14px] md:text-[15px] leading-snug text-gray-600 dark:text-gray-400">
            Guía corta: gestos o flechas. Cada paso es una parte de la experiencia.
          </p>
        </motion.header>

        <DescubreProgress count={n} activeIndex={activeIndex} onDotClick={goToIndex} />

        <div className={`relative mt-5 ${CONTENT_MIN_H}`}>
          <AnimatePresence mode="popLayout" custom={dir} initial={false}>
            <motion.div
              key={block.id}
              custom={dir}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: DURATION, ease: EASE }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              onDragEnd={handleDragEnd}
              className="absolute inset-x-0 top-0 cursor-grab active:cursor-grabbing touch-pan-y"
              style={{ willChange: 'transform, opacity' }}
              role="region"
              aria-roledescription="carrusel"
              aria-label={block.title}
            >
              <article
                id={`descubre-${block.id}`}
                className="rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-gradient-to-br from-white via-white to-violet-50/40 dark:from-gray-900 dark:via-gray-900 dark:to-violet-950/25 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)] dark:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.45)] backdrop-blur-sm md:rounded-[1.35rem]"
              >
                <div className="flex flex-col p-6 md:p-6 md:min-h-[min(52vh,360px)]">
                  <div className="mb-5 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:text-left sm:gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 via-fuchsia-500/15 to-transparent dark:from-violet-400/25 dark:via-fuchsia-500/10 ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/25">
                      <Icon className="h-6 w-6 text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50 md:text-xl">
                        {block.title}
                      </h2>
                    </div>
                  </div>

                  <div
                    className="min-h-0 flex-1 text-[14px] md:text-[15px] leading-snug text-gray-600 dark:text-gray-400 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-gray-800 dark:[&_strong]:text-gray-200"
                    aria-live="polite"
                  >
                    {block.body}
                  </div>

                  <div className="mt-5 flex flex-col gap-2.5 border-t border-gray-200/60 pt-4 dark:border-gray-700/50 sm:mt-auto sm:flex-row sm:items-center sm:justify-between">
                    <motion.button
                      type="button"
                      onClick={onPrev}
                      disabled={activeIndex <= 0}
                      className="order-2 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-200/90 bg-white/60 px-5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50/90 dark:border-gray-600/70 dark:bg-gray-800/50 dark:text-gray-200 dark:hover:bg-gray-800/80 sm:order-1 disabled:pointer-events-none disabled:opacity-35"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.2, ease: EASE }}
                    >
                      <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                      Anterior
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={onNext}
                      disabled={activeIndex >= n - 1}
                      className="order-1 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-violet-600 to-fuchsia-600 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition-shadow hover:shadow-xl hover:shadow-violet-500/30 hover:from-violet-500 hover:to-fuchsia-500 sm:order-2 disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none"
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.2, ease: EASE }}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                    </motion.button>
                  </div>

                  <p className="mt-3 text-center text-[11px] text-gray-400 dark:text-gray-500 sm:hidden">
                    Desliza el bloque horizontalmente para cambiar de paso
                  </p>
                </div>
              </article>
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.p
          className="mt-6 text-center text-sm text-gray-500 dark:text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Link
            href="/"
            className="font-medium text-violet-600 transition-colors hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Volver al inicio
          </Link>
        </motion.p>
      </div>
    </div>
  );
}

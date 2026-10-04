'use client';

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Tag, TicketPercent } from 'lucide-react';

type UploadKindChooserProps = {
  open: boolean;
  onClose: () => void;
  onChooseOffer: () => void;
};

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const subscribeNoop = () => () => {};

export default function UploadKindChooser({ open, onClose, onChooseOffer }: UploadKindChooserProps) {
  const isClient = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const offerOptionRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const choosingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreFocusRef.current = true;
    choosingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => offerOptionRef.current?.focus());
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onDocumentKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current && triggerRef.current?.isConnected) {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  const chooseOffer = () => {
    if (choosingRef.current) return;
    choosingRef.current = true;
    restoreFocusRef.current = false;
    onChooseOffer();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const active = document.activeElement;

    if (event.key === 'Tab') {
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const index = focusable.findIndex((element) => element === active);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) {
        event.preventDefault();
        focusable[0].focus();
      }
      return;
    }

    const options = Array.from(dialog.querySelectorAll<HTMLElement>('[data-upload-kind-option]'));
    const optionIndex = options.findIndex((element) => element === active);
    if (optionIndex < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      options[(optionIndex + 1) % options.length]?.focus();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      options[(optionIndex - 1 + options.length) % options.length]?.focus();
    }
  };

  if (!isClient || !open) return null;

  const optionBase =
    'group relative flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#141414] sm:min-h-0 sm:flex-col sm:items-start sm:gap-4 sm:p-5';

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-md" aria-hidden />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-kind-chooser-title"
        aria-describedby="upload-kind-chooser-subtitle"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-3xl border border-gray-200/80 bg-white p-5 shadow-2xl dark:border-[#262626] dark:bg-[#141414] sm:max-w-2xl sm:p-7"
      >
        <div className="pr-2">
          <h2
            id="upload-kind-chooser-title"
            className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl"
          >
            ¿Qué quieres compartir?
          </h2>
          <p id="upload-kind-chooser-subtitle" className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Comparte algo útil con la comunidad.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4">
          <button
            ref={offerOptionRef}
            type="button"
            data-upload-kind-option
            onClick={chooseOffer}
            className={`${optionBase} border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/60 dark:border-[#262626] dark:bg-[#1a1a1a] dark:hover:border-violet-700/70 dark:hover:bg-violet-950/30`}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300"
              aria-hidden
            >
              <Tag className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-gray-900 dark:text-gray-100">Subir oferta</span>
              <span className="mt-1 block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                Comparte una oferta que encontraste para que la comunidad pueda descubrirla y votarla.
              </span>
            </span>
            <ChevronRight
              className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-violet-600 dark:text-gray-500 dark:group-hover:text-violet-300 sm:hidden"
              aria-hidden
            />
          </button>

          <button
            type="button"
            data-upload-kind-option
            aria-disabled="true"
            aria-describedby="upload-kind-coupon-soon"
            onClick={(event) => event.preventDefault()}
            className={`${optionBase} cursor-not-allowed border-dashed border-gray-200 bg-gray-50/70 dark:border-[#2e2e2e] dark:bg-[#171717]`}
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-[#222] dark:text-gray-500"
              aria-hidden
            >
              <TicketPercent className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-gray-500 dark:text-gray-400">Subir cupón</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  Próximamente
                </span>
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                Comparte un cupón o código promocional para ayudar a la comunidad a ahorrar.
              </span>
              <span id="upload-kind-coupon-soon" className="mt-1.5 block text-[12px] leading-snug text-gray-400 dark:text-gray-500">
                Aún no está disponible. Si tu oferta trae cupón, puedes agregarlo dentro de la oferta.
              </span>
            </span>
          </button>
        </div>

        <div className="mt-5 flex justify-end sm:mt-6">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-gray-300 dark:hover:bg-[#262626] dark:hover:text-gray-100"
          >
            Cancelar
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

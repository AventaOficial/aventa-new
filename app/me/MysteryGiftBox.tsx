'use client';

/** Caja 3D de la referencia — recompensa sorpresa sin revelar valor. */
export default function MysteryGiftBox({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <figure className={`relative flex flex-col items-center ${className}`}>
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/30 blur-3xl"
        aria-hidden
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/cazador-mystery-box.png"
        alt="Recompensa sorpresa oculta"
        width={364}
        height={300}
        className={`relative z-[1] h-auto drop-shadow-[0_0_40px_rgba(139,92,246,0.45)] ${
          compact ? 'w-44 sm:w-52' : 'w-56 sm:w-72 lg:w-[22rem]'
        }`}
      />
      <figcaption className="relative z-[1] mt-1 max-w-[16rem] text-center text-[11px] italic leading-snug text-zinc-400">
        Las buenas ofertas también tienen recompensa.
      </figcaption>
    </figure>
  );
}

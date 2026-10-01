'use client';

import Link from 'next/link';

/** El panel completo vive en /me/programa. Aquí solo el enlace. */
export default function HunterProgram() {
  return (
    <section aria-label="Programa de recompensas" className="space-y-2">
      <p className="text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
        Requisitos y elegibilidad. Independiente de tu nivel.
      </p>
      <Link
        href="/me/programa"
        className="inline-flex rounded-md text-[13px] text-[#1d1d1f] transition-colors duration-150 hover:text-[#6e6e73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1d1f] dark:text-[#fafafa] dark:hover:text-[#a3a3a3] dark:focus-visible:ring-[#fafafa]"
      >
        Ver el programa
      </Link>
    </section>
  );
}

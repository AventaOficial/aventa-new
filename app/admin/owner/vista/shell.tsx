'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

/** Encabezado común de las vistas del CEO. El menú lateral lo pone OwnerShell. */
export default function VistaShell({
  title,
  subtitle,
  crumb,
  toolbar,
  children,
}: {
  title: string;
  subtitle: string;
  crumb: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="sr-only">Cifras del período cargadas desde la operación. Un valor vacío significa que el dato no está disponible.</p>
      <p className="text-[11px] text-white/40">
        <Link href="/admin/owner" className="hover:text-white/70">
          CEO Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-white/70">{crumb}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-0.5 text-[13px] text-white/50">{subtitle}</p>
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

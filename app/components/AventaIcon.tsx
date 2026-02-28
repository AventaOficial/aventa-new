'use client';

/**
 * Icono del logo AVENTA: "A" estilizada / flecha hacia arriba.
 * Dos trazos gruesos que convergen en el vértice superior, base abierta, extremos inferiores redondeados.
 * Usar junto al texto "AVENTA"; el color hereda (currentColor).
 */
export default function AventaIcon({
  className = '',
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Dos trazos gruesos que convergen en el vértice superior; base abierta, extremos redondeados (strokeLinecap) */}
      <path d="M 5.5 21 L 12 2.5" />
      <path d="M 18.5 21 L 12 2.5" />
    </svg>
  );
}

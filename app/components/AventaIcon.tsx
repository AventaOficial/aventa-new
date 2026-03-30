'use client';

/**
 * Logo AVENTA: A abierta con chevron violeta (alineado con icono de marca /icon-512.png).
 */
export default function AventaIcon({
  className = '',
  size = 24,
}: {
  className?: string;
  size?: number;
}) {
  const chevron = '#8b5cf6';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      <path
        d="M 5.5 21 L 12 2.5"
        stroke="currentColor"
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 18.5 21 L 12 2.5"
        stroke="currentColor"
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M 12 14.2 L 9.2 17.5 h 5.6 Z" fill={chevron} />
    </svg>
  );
}

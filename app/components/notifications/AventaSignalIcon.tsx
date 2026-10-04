/**
 * Icono de notificaciones de Aventa: campana facetada con los mismos hombros
 * hexagonales que los sellos de logro. idle = contorno; pending = cuerpo tintado
 * y señal; active = relleno sólido (panel abierto).
 */
export type AventaSignalState = 'idle' | 'pending' | 'active';

const BODY = 'M12 3.2 L17.2 6.4 V12.1 L19.6 16.6 H4.4 L6.8 12.1 V6.4 Z';

export default function AventaSignalIcon({
  state = 'idle',
  className = 'h-5 w-5',
}: {
  state?: AventaSignalState;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path
        d={BODY}
        fill={state === 'idle' ? 'none' : 'currentColor'}
        fillOpacity={state === 'active' ? 1 : 0.16}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <path d="M9.7 19.3a2.4 2.4 0 0 0 4.6 0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path
        d="M12 7.6v4.2"
        stroke={state === 'active' ? '#ffffff' : 'currentColor'}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={state === 'idle' ? 0.55 : 0.9}
      />
      {state === 'pending' ? (
        <g fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <path d="M3.9 5.2a6.4 6.4 0 0 0-1.6 3.9" />
          <path d="M5.9 2.9a9.6 9.6 0 0 0-1.2 1" opacity={0.6} />
        </g>
      ) : null}
    </svg>
  );
}

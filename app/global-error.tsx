'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'Arial, Helvetica, sans-serif', backgroundColor: '#F5F5F7', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', textAlign: 'center' }}>
          <p style={{ fontSize: '3.75rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.5rem' }}>Oops</p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#111', marginBottom: '0.5rem' }}>
            Algo salió mal
          </h1>
          <p style={{ color: '#6b7280', marginBottom: '2rem', maxWidth: '28rem' }}>
            Ocurrió un error grave. Intenta de nuevo o recarga la página.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              backgroundColor: '#7c3aed',
              color: '#fff',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}

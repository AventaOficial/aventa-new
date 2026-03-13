import Link from 'next/link';
import ClientLayout from '@/app/ClientLayout';

export default function CommunitiesPage() {
  return (
    <ClientLayout>
      <div className="min-h-screen relative overflow-hidden">
        <div
          className="fixed inset-0 -z-10"
          style={{
            background:
              'linear-gradient(160deg, rgba(230, 220, 250, 0.95) 0%, rgba(220, 245, 235, 0.9) 40%, rgba(255, 230, 240, 0.9) 100%)',
          }}
        />
        <div
          className="fixed -z-10 w-[320px] h-[320px] rounded-full opacity-60"
          style={{
            top: '-80px',
            right: '-80px',
            background: 'radial-gradient(circle, rgba(200, 180, 255, 0.7) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <div
          className="fixed -z-10 w-[280px] h-[280px] rounded-full opacity-50"
          style={{
            bottom: '-60px',
            left: '-60px',
            background: 'radial-gradient(circle, rgba(180, 230, 210, 0.7) 0%, transparent 70%)',
            filter: 'blur(36px)',
          }}
        />

        <div className="relative max-w-3xl mx-auto px-4 py-8 md:py-12">
          <header className="text-center mb-10 md:mb-14">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Comunidades</h1>
            <p className="text-gray-600 text-lg">Las personas que encuentran las mejores ofertas.</p>
          </header>

          <section>
            <div
              className="rounded-2xl p-6 md:p-8 border shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-6"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.45)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                borderColor: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              <div>
                <h2 className="text-xl md:text-2xl font-semibold text-gray-900 mb-1">Equipo Aventa</h2>
                <p className="text-gray-700">
                  Comunidad oficial del proyecto Aventa. Usa este filtro para ver solo las ofertas curadas por el equipo.
                </p>
              </div>
              <div className="flex md:flex-col items-end md:items-center gap-3 shrink-0">
                <span className="text-xs uppercase tracking-wide text-gray-500">Filtro de comunidad</span>
                <Link
                  href="/communities/equipo-aventa"
                  className="inline-flex items-center justify-center rounded-full bg-violet-600 text-white px-5 py-2 text-sm font-semibold shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-200 ease-[cubic-bezier(0.22,0.61,0.36,1)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  Ver comunidad
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ClientLayout>
  );
}


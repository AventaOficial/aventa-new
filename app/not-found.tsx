import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 text-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
      <p className="text-6xl font-bold text-violet-600 dark:text-violet-400 mb-2">404</p>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Página no encontrada
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
        La página que buscas no existe o fue movida. Vuelve al inicio para seguir cazando ofertas.
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
      >
        Volver al inicio
      </Link>
    </div>
  );
}

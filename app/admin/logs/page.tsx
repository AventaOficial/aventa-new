'use client';

export default function LogsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
        Logs de auditoría
      </h1>
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Logs de cambios de estado, penalizaciones y ajustes — Próximamente (Fase 3)
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Sin auditoría, no puedes defender disputas
        </p>
      </div>
    </div>
  );
}

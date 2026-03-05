'use client';

import Link from 'next/link';
import { BarChart3, Heart, ChevronRight } from 'lucide-react';

export default function AnalistaPanelPage() {
  return (
    <div className="p-4 md:p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Análisis</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Métricas y estado del sistema.</p>

      <ul className="space-y-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <li>
          <Link
            href="/admin/metrics"
            className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <span className="flex items-center gap-3">
              <BarChart3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Métricas
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        </li>
        <li className="border-t border-gray-200 dark:border-gray-700">
          <Link
            href="/admin/health"
            className="flex items-center justify-between px-4 py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <span className="flex items-center gap-3">
              <Heart className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              Health
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </Link>
        </li>
      </ul>
    </div>
  );
}

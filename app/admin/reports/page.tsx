'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { Flag, ChevronDown, ExternalLink, Check, X } from 'lucide-react';

type ReportRow = {
  id: string;
  offer_id: string;
  report_type: string;
  comment: string | null;
  status: string;
  created_at: string;
  offers: { id: string; title?: string; store?: string | null; status?: string } | null;
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  precio_falso: 'Precio falso',
  no_es_oferta: 'No es oferta',
  expirada: 'Expirada',
  spam: 'Spam',
  afiliado_oculto: 'Afiliado oculto',
  otro: 'Otro',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return 'Ahora';
  if (diffM < 60) return `hace ${diffM} min`;
  if (diffH < 24) return `hace ${diffH}h`;
  if (diffD < 7) return `hace ${diffD} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export default function ReportsPage() {
  const { session } = useAuth();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'reviewed' | 'dismissed' | 'all'>('pending');
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const res = await fetch(`/api/admin/reports?status=${statusFilter}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReports(Array.isArray(data) ? data : []);
      }
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleUpdateStatus = async (reportId: string, status: 'reviewed' | 'dismissed') => {
    setActingId(reportId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/admin/reports', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ reportId, status }),
    });
    setActingId(null);
    if (res.ok) {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
    }
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-1">
        Reportes
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Reportes de usuarios sobre ofertas. Revisa y marca como revisado o descartado.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="appearance-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 pl-4 pr-10 py-2 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="pending">Pendientes</option>
            <option value="reviewed">Revisados</option>
            <option value="dismissed">Descartados</option>
            <option value="all">Todos</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {reports.length} reporte{reports.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400 py-8">Cargando…</div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
          <Flag className="h-12 w-12 text-gray-300 dark:text-gray-500 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay reportes {statusFilter !== 'all' ? `con estado "${statusFilter}"` : ''}.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        r.status === 'pending'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          : r.status === 'reviewed'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {REPORT_TYPE_LABELS[r.report_type] ?? r.report_type}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1 line-clamp-2">
                    {r.offers?.title ?? 'Oferta'}
                  </p>
                  {r.offers?.store && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{r.offers.store}</p>
                  )}
                  {r.comment?.trim() && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{r.comment}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`/?o=${r.offer_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver oferta
                  </a>
                  {r.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'reviewed')}
                        disabled={actingId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="h-4 w-4" />
                        Revisado
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(r.id, 'dismissed')}
                        disabled={actingId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                        Descartar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

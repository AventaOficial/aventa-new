'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { CheckCircle, XCircle, MessageCircle, Loader2 } from 'lucide-react';

type CommentRow = {
  id: string;
  offer_id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: string;
  offers: { id: string; title: string | null; store: string | null } | null;
};

export default function ModerationCommentsPage() {
  const { session } = useAuth();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const token = session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/comments?status=${statusFilter}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setComments([]);
        return;
      }
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, statusFilter]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const setStatus = async (commentId: string, newStatus: 'approved' | 'rejected') => {
    const token = session?.access_token;
    if (!token) return;
    setActingId(commentId);
    try {
      const res = await fetch('/api/admin/comments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commentId, status: newStatus }),
      });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } finally {
      setActingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          Moderación de comentarios
        </h1>
        <div className="flex gap-2">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-violet-600 text-white dark:bg-violet-500'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {s === 'pending' ? 'Pendientes' : s === 'all' ? 'Todos' : s === 'approved' ? 'Aprobados' : 'Rechazados'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-gray-500 dark:text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando…
        </div>
      ) : comments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 py-8">No hay comentarios con ese filtro.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    Oferta: {c.offers?.title ?? c.offers?.store ?? c.offer_id}
                  </p>
                  <p className="text-gray-800 dark:text-gray-200 break-words">{c.content}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{formatDate(c.created_at)}</p>
                </div>
                {statusFilter === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setStatus(c.id, 'approved')}
                      disabled={actingId === c.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    >
                      {actingId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      Aprobar
                    </button>
                    <button
                      onClick={() => setStatus(c.id, 'rejected')}
                      disabled={actingId === c.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Rechazar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

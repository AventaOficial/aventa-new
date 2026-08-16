'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { EMPTY_SOCIAL, type SocialConfig } from '@/lib/social/config';

export default function AdminSocialPage() {
  const { session } = useAuth();
  const [social, setSocial] = useState<SocialConfig>(EMPTY_SOCIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    const res = await fetch('/api/admin/social', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? 'No se pudo cargar.');
      setLoading(false);
      return;
    }
    setSocial({ ...EMPTY_SOCIAL, ...data.social });
    setLoading(false);
  }, [session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!session?.access_token) return;
    setSaving(true);
    setError(null);
    setOk(false);
    const res = await fetch('/api/admin/social', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(social),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'No se pudo guardar.');
      return;
    }
    setSocial({ ...EMPTY_SOCIAL, ...data.social });
    setOk(true);
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Redes sociales</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Enlaces públicos del footer y registro del último video de marketing.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#141414]">
          <label className="block text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-200">TikTok</span>
            <input
              value={social.tiktok}
              onChange={(e) => setSocial((s) => ({ ...s, tiktok: e.target.value }))}
              placeholder="https://www.tiktok.com/@aventa"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-200">Instagram</span>
            <input
              value={social.instagram}
              onChange={(e) => setSocial((s) => ({ ...s, instagram: e.target.value }))}
              placeholder="https://www.instagram.com/aventa"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-200">X</span>
            <input
              value={social.x}
              onChange={(e) => setSocial((s) => ({ ...s, x: e.target.value }))}
              placeholder="https://x.com/aventa"
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
            />
          </label>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Último video de marketing</p>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">Título</span>
              <input
                value={social.last_video_title}
                onChange={(e) => setSocial((s) => ({ ...s, last_video_title: e.target.value }))}
                placeholder="Lanzamiento, tutorial, etc."
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">Enlace</span>
              <input
                value={social.last_video_url}
                onChange={(e) => setSocial((s) => ({ ...s, last_video_url: e.target.value }))}
                placeholder="https://www.tiktok.com/..."
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-gray-800 dark:text-gray-200">Red</span>
              <select
                value={social.last_video_network}
                onChange={(e) =>
                  setSocial((s) => ({
                    ...s,
                    last_video_network: e.target.value as SocialConfig['last_video_network'],
                  }))
                }
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#1a1a1a]"
              >
                <option value="">Sin especificar</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
                <option value="x">X</option>
              </select>
            </label>
            {social.last_video_at ? (
              <p className="mt-2 text-xs text-gray-500">
                Registrado: {new Date(social.last_video_at).toLocaleString('es-MX')}
                {social.last_video_url ? (
                  <>
                    {' · '}
                    <a href={social.last_video_url} target="_blank" rel="noopener noreferrer" className="text-violet-600">
                      Ver video
                    </a>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Aún no hay un video registrado.</p>
            )}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-600">Guardado.</p> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  );
}

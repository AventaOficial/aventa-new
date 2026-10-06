'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useTheme, type ThemePreference } from '@/app/providers/ThemeProvider';

const MAX_BIO = 280;

type Identity = {
  bio: string;
  city: string;
  state: string;
  showLocation: boolean;
  showActivity: boolean;
  profileVisibility: 'public' | 'private';
  avatarUrl: string | null;
  coverUrl: string | null;
};

const EMPTY: Identity = {
  bio: '',
  city: '',
  state: '',
  showLocation: false,
  showActivity: true,
  profileVisibility: 'public',
  avatarUrl: null,
  coverUrl: null,
};

async function uploadImage(token: string, file: File, kind: 'avatar' | 'cover') {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('kind', kind);
  const response = await fetch('/api/upload-profile-avatar', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; avatar_url?: string; cover_url?: string };
  if (!response.ok) throw new Error(body.error || 'No se pudo subir la imagen');
  return body;
}

export function AppearancePicker() {
  const { preference, setThemePreference } = useTheme();
  const options: Array<{ id: ThemePreference; label: string }> = [
    { id: 'light', label: 'Claro' },
    { id: 'dark', label: 'Oscuro' },
    { id: 'system', label: 'Sistema' },
  ];
  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">Apariencia</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={preference === option.id}
            onClick={() => setThemePreference(option.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              preference === option.id
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 text-gray-700 dark:bg-[#1a1a1a] dark:text-gray-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function ProfileFields() {
  const { session } = useAuth();
  const { showToast } = useUI();
  const [identity, setIdentity] = useState<Identity>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    void createClient()
      .from('profiles')
      .select('bio, city, state, cover_url, avatar_url, show_location, show_activity, profile_visibility')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        const row = data as {
          bio?: string | null;
          city?: string | null;
          state?: string | null;
          cover_url?: string | null;
          avatar_url?: string | null;
          show_location?: boolean | null;
          show_activity?: boolean | null;
          profile_visibility?: string | null;
        };
        setIdentity({
          bio: row.bio ?? '',
          city: row.city ?? '',
          state: row.state ?? '',
          coverUrl: row.cover_url ?? null,
          avatarUrl: row.avatar_url ?? null,
          showLocation: row.show_location === true,
          showActivity: row.show_activity !== false,
          profileVisibility: row.profile_visibility === 'private' ? 'private' : 'public',
        });
      });
  }, [session?.user?.id]);

  async function save(next: Identity) {
    const userId = session?.user?.id;
    if (!userId) return;
    setSaving(true);
    const { error } = await createClient()
      .from('profiles')
      .update({
        bio: next.bio.trim() || null,
        city: next.city.trim() || null,
        state: next.state.trim() || null,
        show_location: next.showLocation,
        show_activity: next.showActivity,
        profile_visibility: next.profileVisibility,
      })
      .eq('id', userId);
    setSaving(false);
    if (error) {
      showToast('No se pudo guardar el perfil.');
      return;
    }
    setIdentity(next);
    showToast('Perfil actualizado.');
  }

  async function onFile(kind: 'avatar' | 'cover', file: File | undefined) {
    const token = session?.access_token;
    if (!file || !token) return;
    try {
      const body = await uploadImage(token, file, kind);
      setIdentity((current) => ({
        ...current,
        avatarUrl: body.avatar_url ?? current.avatarUrl,
        coverUrl: body.cover_url ?? current.coverUrl,
      }));
      showToast(kind === 'cover' ? 'Portada actualizada.' : 'Foto actualizada.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'No se pudo subir la imagen');
    }
  }

  return (
    <div className="space-y-5 border-t border-gray-200 p-5 dark:border-gray-700 md:p-6">
      <div className="flex flex-wrap gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm font-medium dark:border-gray-600">
          Cambiar foto de perfil
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onFile('avatar', event.target.files?.[0])} />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-gray-300 px-4 text-sm font-medium dark:border-gray-600">
          Cambiar portada
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void onFile('cover', event.target.files?.[0])} />
        </label>
      </div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="profile-bio">
        Bio
        <textarea
          id="profile-bio"
          maxLength={MAX_BIO}
          value={identity.bio}
          onChange={(event) => setIdentity((current) => ({ ...current, bio: event.target.value }))}
          className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm dark:border-gray-600 dark:bg-[#1a1a1a]"
          rows={3}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="profile-city">
          Ciudad
          <input id="profile-city" value={identity.city} onChange={(event) => setIdentity((current) => ({ ...current, city: event.target.value }))} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm dark:border-gray-600 dark:bg-[#1a1a1a]" />
        </label>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="profile-state">
          Estado
          <input id="profile-state" value={identity.state} onChange={(event) => setIdentity((current) => ({ ...current, state: event.target.value }))} className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm dark:border-gray-600 dark:bg-[#1a1a1a]" />
        </label>
      </div>
      <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Privacidad</h3>
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={identity.profileVisibility === 'public'} onChange={(event) => setIdentity((current) => ({ ...current, profileVisibility: event.target.checked ? 'public' : 'private' }))} />
          Perfil visible para la comunidad
        </label>
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={identity.showActivity} onChange={(event) => setIdentity((current) => ({ ...current, showActivity: event.target.checked }))} />
          Mostrar actividad y ofertas
        </label>
        <label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" checked={identity.showLocation} onChange={(event) => setIdentity((current) => ({ ...current, showLocation: event.target.checked }))} />
          Mostrar ciudad y estado
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Los logros destacados se eligen en tu perfil, hasta cinco. Ciudad y estado quedan ocultos hasta que actives esta opción.
        </p>
      </div>
      <button type="button" disabled={saving} onClick={() => void save(identity)} className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {saving ? 'Guardando…' : 'Guardar perfil'}
      </button>
    </div>
  );
}

'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { User, Check, Lock, Smartphone, Bell, Camera, Loader2 } from 'lucide-react';
import ClientLayout from '@/app/ClientLayout';
import { useAuth } from '@/app/providers/AuthProvider';

const DAYS_LIMIT = 14;
const AVATAR_MAX_MB = 1;

export default function SettingsPage() {
  const router = useRouter();
  const { resetPassword, session, user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [displayNameUpdatedAt, setDisplayNameUpdatedAt] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [emailDailyDigest, setEmailDailyDigest] = useState(false);
  const [emailWeeklyDigest, setEmailWeeklyDigest] = useState(false);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;
    setIsIOS(isApple);
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (installPrompt) await installPrompt.prompt();
  };

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/');
        return;
      }
      setUserEmail(user.email ?? '');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, display_name_updated_at, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      if (profileError) {
        setLoading(false);
        return;
      }
      setDisplayName(profile?.display_name ?? '');
      setDisplayNameUpdatedAt((profile as { display_name_updated_at?: string } | null)?.display_name_updated_at ?? null);
      setAvatarUrl((profile as { avatar_url?: string | null } | null)?.avatar_url ?? null);
      setLoading(false);
    };
    loadProfile();
  }, [router]);

  useEffect(() => {
    if (!user?.id) {
      setEmailDailyDigest(false);
      setEmailWeeklyDigest(false);
      return;
    }
    if (!session?.access_token) return;
    const loadPrefs = async () => {
      try {
        const res = await fetch('/api/notifications/preferences', {
          headers: { Authorization: 'Bearer ' + session.access_token },
        });
        if (!res.ok) return;
        const data = await res.json();
        setEmailDailyDigest(data.email_daily_digest ?? false);
        setEmailWeeklyDigest(data.email_weekly_digest ?? false);
      } catch {
        setEmailDailyDigest(false);
        setEmailWeeklyDigest(false);
      }
    };
    loadPrefs();
  }, [user?.id, session?.access_token]);

  const handleEmailPrefChange = async (which: 'daily' | 'weekly', value: boolean) => {
    if (!session?.access_token) return;
    if (which === 'daily') setEmailDailyDigest(value);
    else setEmailWeeklyDigest(value);
    setEmailPrefsSaving(true);
    try {
      const body = which === 'daily' ? { email_daily_digest: value } : { email_weekly_digest: value };
      await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify(body),
      });
    } finally {
      setEmailPrefsSaving(false);
    }
  };

  const canChangeName = (): boolean => {
    if (!displayNameUpdatedAt) return true;
    const updated = new Date(displayNameUpdatedAt).getTime();
    const now = Date.now();
    return (now - updated) >= DAYS_LIMIT * 24 * 60 * 60 * 1000;
  };

  const daysUntilNextChange = (): number => {
    if (!displayNameUpdatedAt || canChangeName()) return 0;
    const updated = new Date(displayNameUpdatedAt).getTime();
    const nextAllowed = updated + DAYS_LIMIT * 24 * 60 * 60 * 1000;
    return Math.ceil((nextAllowed - Date.now()) / (24 * 60 * 60 * 1000));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChangeName()) return;
    setSaving(true);
    setSuccessMessage('');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/');
      return;
    }
    const updatedAt = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        display_name_updated_at: updatedAt,
      })
      .eq('id', user.id)
      .select('display_name_updated_at')
      .single();
    setSaving(false);
    if (error) return;
    setDisplayNameUpdatedAt(updated?.display_name_updated_at ?? updatedAt);
    setSuccessMessage('Cambios guardados');
  };

  const handlePasswordReset = async () => {
    if (!userEmail) return;
    const { error } = await resetPassword(userEmail);
    if (!error) setPasswordResetSent(true);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.access_token) return;
    setAvatarError('');
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
      setAvatarError(`Máximo ${AVATAR_MAX_MB}MB`);
      return;
    }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type?.toLowerCase() ?? '')) {
      setAvatarError('Solo jpg, png o webp');
      return;
    }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAvatarError(data?.error ?? 'Error al subir');
        return;
      }
      if (data?.url) setAvatarUrl(data.url);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    } finally {
      setAvatarUploading(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="mx-auto max-w-xl px-4 py-12">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 shadow-sm animate-pulse">
            <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
            <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6" />
            <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent">
        <div className="mx-auto max-w-xl px-4 py-8 md:py-12">
          <h1 className="text-2xl md:text-3xl font-bold text-[#1d1d1f] dark:text-gray-100 mb-1">
            Configuración
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
            Perfil, seguridad y notificaciones
          </p>

          {/* General: Perfil (avatar + nombre) */}
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            General
          </h2>
          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Perfil</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Nombre visible y foto de perfil</p>
                </div>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  className="sr-only"
                  disabled={avatarUploading}
                  aria-label="Subir foto de perfil"
                />
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="h-20 w-20 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-10 w-10 text-gray-400 dark:text-gray-500" />
                    )}
                  </button>
                  {avatarUploading && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center pointer-events-none">
                      <Loader2 className="h-8 w-8 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={avatarUploading}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                  >
                    <Camera className="h-4 w-4" />
                    {avatarUrl ? 'Cambiar foto' : 'Añadir foto de perfil'}
                  </button>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    JPG, PNG o WebP. Máximo {AVATAR_MAX_MB}MB.
                  </p>
                  {avatarError && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{avatarError}</p>
                  )}
                </div>
              </div>
              <div>
                <label
                  htmlFor="display_name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Nombre visible
                </label>
                <input
                  id="display_name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors disabled:opacity-60"
                  placeholder="Tu nombre en AVENTA"
                  disabled={saving || !canChangeName()}
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Solo puedes cambiarlo una vez cada 14 días.
                  {!canChangeName() && daysUntilNextChange() > 0 && (
                    <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
                      Podrás cambiarlo de nuevo en {daysUntilNextChange()} día{daysUntilNextChange() !== 1 ? 's' : ''}.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                {successMessage && (
                  <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    {successMessage}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Seguridad */}
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-8 mb-3">
            Seguridad
          </h2>
          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700">
                  <Lock className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Contraseña</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Restablecer contraseña por correo</p>
                </div>
              </div>
            </div>
            <div className="p-5 md:p-6">
              {passwordResetSent ? (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Revisa tu correo. Te enviamos un enlace para restablecer tu contraseña.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Te enviaremos un enlace a <strong className="text-gray-900 dark:text-gray-100">{userEmail}</strong> para restablecer tu contraseña.
                  </p>
                  <button
                    type="button"
                    onClick={handlePasswordReset}
                    className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-6 py-3 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Enviar enlace para restablecer
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Notificaciones */}
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-8 mb-3">
            Notificaciones
          </h2>
          <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                  <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">Correos</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Resumen diario y semanal</p>
                </div>
              </div>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailDailyDigest}
                  onChange={(e) => handleEmailPrefChange('daily', e.target.checked)}
                  disabled={emailPrefsSaving}
                  className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Resumen diario (Top 10 ofertas)</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">Un correo al día. Hora aproximada: salida del trabajo.</p>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailWeeklyDigest}
                  onChange={(e) => handleEmailPrefChange('weekly', e.target.checked)}
                  disabled={emailPrefsSaving}
                  className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Resumen semanal (domingos)</span>
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">Más comentadas y mejor votadas de la semana.</p>
            </div>
          </section>

          {/* App */}
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-8 mb-3 md:hidden">
            App
          </h2>
          <section className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden md:hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
                  <Smartphone className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">Instalar app</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Añade AVENTA a tu pantalla de inicio</p>
                </div>
              </div>
            </div>
            <div className="p-5 md:p-6 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Usa AVENTA como app: icono en tu pantalla, pantalla completa y acceso rápido.
              </p>
              {installPrompt && (
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="rounded-xl bg-violet-600 hover:bg-violet-500 text-white px-6 py-3 font-medium transition-colors"
                >
                  Instalar en esta dispositivo
                </button>
              )}
              {isIOS && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  En iPhone o iPad: abre el menú compartir en Safari (cuadro con flecha) y elige &quot;Añadir a pantalla de inicio&quot;.
                </p>
              )}
              {!installPrompt && !isIOS && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  En el navegador, usa la opción &quot;Instalar&quot; o &quot;Añadir a la pantalla de inicio&quot; cuando aparezca.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </ClientLayout>
  );
}

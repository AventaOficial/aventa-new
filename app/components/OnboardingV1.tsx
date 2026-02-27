'use client';

import { X, Plus, ThumbsUp, Heart } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import DarkModeToggle from './DarkModeToggle';

const GUIDE_STEPS = [
  {
    icon: Plus,
    title: 'Subir oferta',
    description: 'Comparte lo que encuentres. La comunidad decide las mejores ofertas.',
  },
  {
    icon: ThumbsUp,
    title: 'Votar',
    description: 'Ayuda a la comunidad votando. Las mejores suben.',
  },
  {
    icon: Heart,
    title: 'Guardar',
    description: 'Guarda tus ofertas favoritas para verlas después.',
  },
];

const t = { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const };
const waveEase = [0.33, 0.2, 0.2, 1] as const;

function WaveText({ text, className = '' }: { text: string; className?: string }) {
  const words = text.split(' ');
  return (
    <span className={`inline-flex flex-wrap justify-center gap-x-[0.25em] ${className}`}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 * i, duration: 0.48, ease: waveEase }}
          className="inline-block"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

function PageWelcome({ onNext }: { onNext: () => void }) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={t}
      className="flex flex-col items-center justify-center text-center flex-1 min-h-0 px-6 py-6 md:py-12"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, ...t }}
        className="mb-6 md:mb-8"
      >
        <span className="text-sm font-semibold tracking-[0.2em] uppercase text-violet-600 dark:text-violet-400">
          AVENTA
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...t }}
        className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4 md:mb-6"
      >
        <span className="bg-gradient-to-r from-[#1d1d1f] via-violet-700 to-[#1d1d1f] dark:from-white dark:via-violet-300 dark:to-white bg-clip-text text-transparent">
          AVENTA
        </span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, ...t }}
        className="text-base sm:text-lg md:text-xl text-[#6e6e73] dark:text-[#a3a3a3] mb-8 md:mb-12 max-w-sm leading-relaxed"
      >
        <WaveText text="Bienvenido a la mejor comunidad cazadora de ofertas" />
      </motion.p>

      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, ...t }}
        onClick={onNext}
        className="rounded-2xl bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-10 py-4 font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
      >
        Continuar
      </motion.button>
    </motion.div>
  );
}

function PageHowItWorks({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const step = GUIDE_STEPS[stepIndex];
  const Icon = step.icon;
  const isLast = stepIndex === GUIDE_STEPS.length - 1;

  const handleContinue = () => {
    if (isLast) onNext();
    else {
      setDirection(1);
      setStepIndex((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (stepIndex === 0) onBack();
    else {
      setDirection(-1);
      setStepIndex((i) => i - 1);
    }
  };

  const slideX = 32;
  const variants = {
    enter: { opacity: 0, x: direction > 0 ? slideX : -slideX, scale: 0.96 },
    center: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: direction > 0 ? -slideX : slideX, scale: 0.96 },
  };

  return (
    <motion.div
      key="how-it-works"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={t}
      className="flex flex-col flex-1 min-h-0 px-6 py-4 md:py-8"
    >
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, ...t }}
        className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#fafafa] mb-6 md:mb-8 text-center shrink-0"
      >
        <WaveText text="Cómo funciona" />
      </motion.h2>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={t}
            className="flex flex-col items-center text-center w-full max-w-sm"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
              className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 dark:from-violet-500 dark:to-violet-700 shadow-lg shadow-violet-500/30 mb-5"
            >
              <Icon className="h-8 w-8 md:h-10 md:w-10 text-white" />
            </motion.div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-3">
              {step.title}
            </h3>
            <p className="text-sm sm:text-base text-[#6e6e73] dark:text-[#a3a3a3] leading-relaxed">
              {step.description}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-1.5 mt-6 mb-4">
          {GUIDE_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-6 bg-violet-500'
                  : i < stepIndex
                  ? 'w-1.5 bg-violet-400/60'
                  : 'w-1.5 bg-[#d2d2d7] dark:bg-[#404040]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-xs mx-auto shrink-0">
        <button
          onClick={handleBack}
          className="flex-1 rounded-xl border-2 border-[#d2d2d7] dark:border-[#404040] bg-transparent px-4 py-3 font-semibold text-[#1d1d1f] dark:text-[#fafafa] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a] transition-colors"
        >
          {stepIndex === 0 ? '← Atrás' : '← Anterior'}
        </button>
        <motion.button
          onClick={handleContinue}
          whileTap={{ scale: 0.98 }}
          className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-4 py-3 font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all"
        >
          {isLast ? 'Continuar' : 'Continuar'}
        </motion.button>
      </div>
    </motion.div>
  );
}

type AuthModalMode = 'signup' | 'signin';
function PageAuth({
  onSuccess,
  onBack,
}: {
  onSuccess: () => void;
  onBack: () => void;
}) {
  const { session, signIn, signUp, signInWithOAuth, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>('signup');
  const didAutoSuccess = useRef(false);

  useEffect(() => {
    if (session && !didAutoSuccess.current) {
      didAutoSuccess.current = true;
      onSuccess();
    }
  }, [session, onSuccess]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await signUp(email.trim(), password, name.trim() || undefined);
        if (err) {
          setError(err.message);
          return;
        }
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) {
          setError(err.message);
          return;
        }
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
    setError(null);
    setResetSent(false);
  };

  const inputClass = 'w-full rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373]';

  return (
    <motion.div
      key="auth"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={t}
      className="flex flex-col items-center justify-center w-full max-w-md mx-auto px-4 flex-1 min-h-0 py-4 overflow-y-auto"
    >
      <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-[#fafafa] mb-4 md:mb-6 text-center">
        <WaveText text={mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'} />
      </h2>

      <div className="w-full flex flex-col gap-2 mb-4">
        <button
          type="button"
          disabled={oauthLoading}
          onClick={async () => {
            setError(null);
            setOauthLoading(true);
            const { error: err } = await signInWithOAuth('google');
            if (err) {
              setError(err.message);
              setOauthLoading(false);
            }
          }}
          className="w-full rounded-xl border-2 border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 font-medium text-[#1d1d1f] dark:text-[#fafafa] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a] flex items-center justify-center gap-3 transition-colors disabled:opacity-70"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {oauthLoading ? 'Redirigiendo...' : 'Continuar con Google'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          inputMode="email"
          className={inputClass}
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className={inputClass}
        />
        {mode === 'signin' && (
          <p className="text-right -mt-1">
            <button
              type="button"
              onClick={async () => {
                if (!email.trim()) {
                  setError('Introduce tu email para restablecer');
                  return;
                }
                setError(null);
                setLoading(true);
                const { error: err } = await resetPassword(email.trim());
                setLoading(false);
                if (err) setError(err.message);
                else setResetSent(true);
              }}
              disabled={loading}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-70"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}
        {resetSent && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Revisa tu correo. Te enviamos un enlace para restablecer tu contraseña.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 disabled:opacity-70 disabled:shadow-none transition-all"
        >
          {loading ? 'Espera...' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </form>
      <p className="text-center mt-3">
        <button
          type="button"
          onClick={toggleMode}
          className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] hover:underline"
        >
          {mode === 'signup' ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear cuenta'}
        </button>
      </p>
      <button
        onClick={onBack}
        className="mt-4 text-sm text-[#6e6e73] dark:text-[#a3a3a3] hover:underline"
      >
        ← Volver
      </button>
    </motion.div>
  );
}

const RegisterModal = ({
  onClose,
  onSuccess,
  onJustSignedUp,
  initialMode,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onJustSignedUp?: () => void;
  initialMode?: AuthModalMode;
}) => {
  const { signIn, signUp, signInWithOAuth, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthModalMode>(initialMode ?? 'signup');
  useEffect(() => {
    if (initialMode != null) setMode(initialMode);
  }, [initialMode]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await signUp(email.trim(), password, name.trim() || undefined);
        if (err) {
          setError(err.message);
          return;
        }
        onJustSignedUp?.();
        onSuccess();
        onClose();
      } else {
        const { error: err } = await signIn(email.trim(), password);
        if (err) {
          setError(err.message);
          return;
        }
        onSuccess();
        onClose();
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
    setError(null);
    setResetSent(false);
  };

  const inputClass = 'w-full rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373]';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-md rounded-3xl bg-white dark:bg-[#0a0a0a] p-8 shadow-2xl transition-[transform,opacity] duration-200 ease-out opacity-100 scale-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full bg-[#f5f5f7] dark:bg-[#262626] p-2 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#e5e5e7] dark:hover:bg-[#404040]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-xl font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-4">
          {mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
        </h3>
        <div className="flex flex-col gap-2 mb-4">
          <button
            type="button"
            disabled={oauthLoading}
            onClick={async () => {
              setError(null);
              setOauthLoading(true);
              const { error: err } = await signInWithOAuth('google');
              if (err) {
                setError(err.message);
                setOauthLoading(false);
              }
            }}
            className="w-full rounded-xl border-2 border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 font-medium text-[#1d1d1f] dark:text-[#fafafa] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a] flex items-center justify-center gap-3 transition-colors disabled:opacity-70"
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {oauthLoading ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
            className={inputClass}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inputClass}
          />
          {mode === 'signin' && (
            <p className="text-right -mt-1">
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setError('Introduce tu email para restablecer');
                    return;
                  }
                  setError(null);
                  setLoading(true);
                  const { error: err } = await resetPassword(email.trim());
                  setLoading(false);
                  if (err) setError(err.message);
                  else setResetSent(true);
                }}
                disabled={loading}
                className="text-sm text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-70"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </p>
          )}
          {resetSent && (
            <p className="text-sm text-green-600 dark:text-green-400">
              Revisa tu correo. Te enviamos un enlace para restablecer tu contraseña.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-3.5 font-semibold text-white shadow-lg shadow-violet-500/25 mt-2 disabled:opacity-70 hover:shadow-violet-500/40 transition-all"
          >
            {loading ? 'Espera...' : mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </form>
        <p className="text-center mt-4">
          <button type="button" onClick={toggleMode} className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] hover:underline">
            {mode === 'signup' ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear cuenta'}
          </button>
        </p>
      </div>
    </div>
  );
};

export function GuideModalStandalone() {
  const { showGuideModal, closeGuideModal } = useUI();
  const [stepIndex, setStepIndex] = useState(0);
  const step = GUIDE_STEPS[stepIndex];
  const Icon = step.icon;
  const isLast = stepIndex === GUIDE_STEPS.length - 1;

  useEffect(() => {
    if (!showGuideModal) return;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [showGuideModal]);

  if (!showGuideModal) return null;
  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/50"
      onClick={closeGuideModal}
      role="dialog"
      aria-modal="true"
      aria-label="Guía rápida"
    >
      <div
        className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-[#141414] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={closeGuideModal}
          className="absolute top-4 right-4 rounded-full bg-[#f5f5f7] dark:bg-[#262626] p-2 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#e5e5e7] dark:hover:bg-[#404040]"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-4 text-center">
          Cómo funciona
        </h2>
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 mb-4">
            <Icon className="h-7 w-7 text-white" />
          </div>
          <h3 className="text-lg font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-2">{step.title}</h3>
          <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] leading-relaxed">{step.description}</p>
        </div>
        <div className="flex gap-2 mb-4">
          {GUIDE_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex ? 'w-6 bg-violet-500' : i < stepIndex ? 'w-1.5 bg-violet-400/60' : 'w-1.5 bg-[#d2d2d7] dark:bg-[#404040]'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0}
            className="flex-1 rounded-xl border-2 border-[#d2d2d7] dark:border-[#404040] bg-transparent px-4 py-3 font-semibold text-[#1d1d1f] dark:text-[#fafafa] disabled:opacity-50"
          >
            Anterior
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={closeGuideModal}
              className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-3 font-semibold text-white"
            >
              Entendido
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => i + 1)}
              className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-3 font-semibold text-white"
            >
              Siguiente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingV1() {
  const {
    showGuide,
    showPendingMessage,
    dismissPendingMessage,
    markJustSignedUp,
    showRegisterModal,
    registerModalInitialMode,
    closeRegisterModal,
    openGuide,
    closeOnboarding,
    finalizeOnboarding,
  } = useUI();
  const [page, setPage] = useState(0);
  const [openAnimated, setOpenAnimated] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mountKey, setMountKey] = useState(0);

  useEffect(() => {
    if (!showGuide) return;
    setPage(0);
    setClosing(false);
    setMountKey((k) => k + 1);
    setOpenAnimated(true);
  }, [showGuide]);

  useEffect(() => {
    const isOverlayOpen = showGuide || showPendingMessage || showRegisterModal;
    if (isOverlayOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.documentElement.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
      document.documentElement.style.overscrollBehavior = '';
    };
  }, [showGuide, showPendingMessage, showRegisterModal]);

  if (!showRegisterModal && !showGuide && !showPendingMessage) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      closeOnboarding();
      setClosing(false);
    }, 200);
  };

  const handleAuthSuccess = () => {
    setClosing(true);
    setTimeout(async () => {
      await finalizeOnboarding();
      setClosing(false);
    }, 200);
  };

  const handleDismissPending = () => {
    setClosing(true);
    setTimeout(() => {
      dismissPendingMessage();
      setClosing(false);
    }, 200);
  };

  if (showRegisterModal) {
    return (
      <RegisterModal
        initialMode={registerModalInitialMode ?? 'signup'}
        onJustSignedUp={() => {
          markJustSignedUp();
          closeRegisterModal();
          openGuide();
        }}
        onClose={closeRegisterModal}
        onSuccess={() => closeRegisterModal()}
      />
    );
  }

  if (showPendingMessage) {
    return (
      <div
        className={`fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#F5F5F7]/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md p-4 transition-[transform,opacity] duration-200 ease-out will-change-transform ${openAnimated && !closing ? 'opacity-100' : 'opacity-0'}`}
      >
        <div
          className={`relative w-full max-w-sm rounded-3xl bg-white dark:bg-[#141414] p-10 shadow-2xl transition-[transform,opacity] duration-200 ease-out will-change-transform ${openAnimated && !closing ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        >
          <button
            onClick={handleDismissPending}
            className="absolute top-4 right-4 rounded-full bg-[#f5f5f7] dark:bg-[#262626] p-2 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#e5e5e7] dark:hover:bg-[#404040]"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="absolute top-4 left-4 z-10">
            <DarkModeToggle />
          </div>
          <p className="text-center text-lg text-[#1d1d1f] dark:text-[#fafafa]">
            Revisa tu correo para verificar tu cuenta
          </p>
        </div>
      </div>
    );
  }

  const overlayVisible = showGuide && !closing;
  return (
    <motion.div
      initial={false}
      animate={{ opacity: overlayVisible ? 1 : 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden overscroll-none bg-gradient-to-b from-[#F5F5F7] to-[#fafafa] dark:from-[#0a0a0a] dark:to-[#0d0d0f] w-full min-h-[100dvh] min-h-[100svh] h-[100dvh] h-[100svh] p-0 sm:p-4"
      style={{ overscrollBehavior: 'none', height: '100dvh', minHeight: '100dvh' }}
    >
      <div className="relative flex w-full h-full sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl flex-col bg-white dark:bg-[#0a0a0a] sm:dark:bg-[#141414] shadow-2xl overflow-hidden sm:border sm:border-[#e5e5e7] dark:sm:border-[#262626] min-h-0">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 rounded-full bg-[#f5f5f7] dark:bg-[#262626] p-2 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#e5e5e7] dark:hover:bg-[#404040] transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="absolute top-4 left-4 z-10">
          <DarkModeToggle />
        </div>

        <div className="flex justify-center gap-1.5 pt-16 sm:pt-4 pb-2 sm:pb-4 shrink-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === page
                  ? 'w-6 bg-violet-500'
                  : i < page
                  ? 'w-1 bg-violet-400/60'
                  : 'w-1 bg-[#d2d2d7] dark:bg-[#404040]'
              }`}
            />
          ))}
        </div>

        <div key={mountKey} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {page === 0 && (
              <PageWelcome onNext={() => setPage(1)} />
            )}
            {page === 1 && (
              <PageHowItWorks
                onNext={() => setPage(2)}
                onBack={() => setPage(0)}
              />
            )}
            {page === 2 && (
              <PageAuth
                onSuccess={handleAuthSuccess}
                onBack={() => setPage(1)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

'use client';

import { X, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FavoriteOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FavoriteOnboarding({ isOpen, onClose }: FavoriteOnboardingProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] pointer-events-none"
      >
        {/* Overlay ligero */}
        <div className="absolute inset-0 bg-black/30" />

        {/* Spotlight en el corazón */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="absolute top-20 left-4 rounded-full border-4 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.3)]"
          style={{
            width: '48px',
            height: '48px',
          }}
        />

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="absolute top-32 left-4 z-[100] w-72 rounded-2xl bg-white p-4 shadow-2xl pointer-events-auto"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-gradient-to-br from-purple-600 to-pink-500 dark:from-pink-500 dark:to-purple-500 p-2 transition-all duration-600 ease-[0.16,1,0.3,1]">
              <Heart className="h-5 w-5 text-white fill-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-1">¡Primer favorito!</h3>
              <p className="text-sm text-gray-600">
                Cada favorito ayuda a crear tu feed personalizado "Para ti".
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

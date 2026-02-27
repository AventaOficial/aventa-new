'use client';

import { MessageCircle, X, Sparkles, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';

export default function ChatBubble() {
  useTheme(); // Forzar re-render cuando cambia el tema
  const { isOfferOpen, lunaOpenRequested, setLunaOpenRequested } = useUI();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (lunaOpenRequested) {
      setIsOpen(true);
      setLunaOpenRequested(false);
    }
  }, [lunaOpenRequested, setLunaOpenRequested]);
  const [chatPanelBottom, setChatPanelBottom] = useState<number | null>(null);
  const [chatPanelHeight, setChatPanelHeight] = useState<number | null>(null);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'luna',
      text: '¡Hola! Soy Luna, tu asistente de la comunidad 🎯\n\nTe ayudo a explorar lo que la comunidad encuentra. Luna está en desarrollo.',
      time: 'Ahora',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const messageCount = messages.length;

  const handleSendMessage = () => {
    if (!inputValue.trim() || messageCount >= 8) return;

    // Mensaje del usuario
    const userMessage = {
      id: messageCount + 1,
      sender: 'user',
      text: inputValue,
      time: 'Ahora',
    };

    // Respuesta mock de Luna
    const lunaResponses = [
      'La comunidad ha encontrado varias opciones. Déjame mostrarte...',
      'Hay ofertas interesantes que otros cazadores compartieron.',
      'Esa categoría tiene buenas opciones de la comunidad.',
      'Revisando lo que la comunidad encontró recientemente.',
    ];

    const lunaMessage = {
      id: messageCount + 2,
      sender: 'luna',
      text: lunaResponses[Math.floor(Math.random() * lunaResponses.length)],
      time: 'Ahora',
    };

    setMessages([...messages, userMessage, lunaMessage]);
    setInputValue('');

    // Si alcanza el límite, mostrar mensaje final
    if (messageCount + 2 >= 8) {
      setTimeout(() => {
        const finalMessage = {
          id: messageCount + 3,
          sender: 'luna',
          text: '¡Hemos alcanzado el límite de mensajes! Inicia un nuevo chat cuando quieras seguir buscando ofertas. 🚀',
          time: 'Ahora',
        };
        setMessages((prev) => [...prev, finalMessage]);
      }, 1000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const canSendMessage = messageCount < 8 && inputValue.trim().length > 0;

  // Chat panel: ajustar bottom con visualViewport cuando abre el teclado (móvil)
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const updateBottom = () => {
      const keyboardOpen = viewport.height < window.innerHeight - 100;
      if (keyboardOpen) {
        setChatPanelBottom(window.innerHeight - viewport.offsetTop - viewport.height);
        setChatPanelHeight(viewport.height);
      } else {
        setChatPanelBottom(null);
        setChatPanelHeight(null);
      }
    };
    updateBottom();
    viewport.addEventListener('resize', updateBottom);
    viewport.addEventListener('scroll', updateBottom);
    return () => {
      viewport.removeEventListener('resize', updateBottom);
      viewport.removeEventListener('scroll', updateBottom);
      setChatPanelBottom(null);
      setChatPanelHeight(null);
    };
  }, [isOpen]);

  return (
    <>
      {/* Botón flotante (FAB): oculto cuando oferta abierta — diseño integrado */}
      {!isOfferOpen && (
        <AnimatePresence>
          {!isOpen && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              onClick={() => setIsOpen(true)}
              className="fixed left-4 right-auto md:right-6 md:left-auto translate-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[1000] flex h-14 w-14 md:h-14 md:w-14 items-center justify-center rounded-2xl bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xl border border-[#e5e5e7] dark:border-[#262626] shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)] transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="h-6 w-6 md:h-6 md:w-6 text-violet-600 dark:text-violet-400" />
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* Panel expandido: móvil modal centrado (card); desktop lateral derecha; bottom dinámico con teclado; oculto cuando oferta abierta */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
            style={chatPanelBottom !== null ? { bottom: chatPanelBottom, height: chatPanelHeight ?? undefined } : undefined}
            className={`fixed left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-[1100] w-[92%] max-w-md md:w-[30rem] max-h-[75vh] md:max-h-[90dvh] flex flex-col min-h-0 overflow-hidden rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] shadow-[0_8px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.4)] ${chatPanelBottom === null ? 'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))]' : ''} ${chatPanelHeight === null ? 'md:h-[90dvh]' : ''}`}
          >
            {/* Header — integrado con el diseño */}
            <div className="flex items-center justify-between p-4 border-b border-[#e5e5e7] dark:border-[#262626] bg-[#f5f5f7]/50 dark:bg-[#1a1a1a]/50">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Luna</h3>
                  <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">Asistente de la comunidad</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setMessages([
                    {
                      id: 1,
                      sender: 'luna',
                      text: '¡Hola! Soy Luna, tu asistente de la comunidad 🎯\n\nTe ayudo a explorar lo que la comunidad encuentra. Luna está en desarrollo.',
                      time: 'Ahora',
                    },
                  ]);
                  setInputValue('');
                }}
                className="rounded-xl p-2 text-[#6e6e73] dark:text-[#a3a3a3] hover:bg-[#e5e5e7] dark:hover:bg-[#262626] transition-colors duration-150"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Mensaje de desarrollo */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800/30 px-4 py-2 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Luna está en desarrollo. Cualquier información debe verificarse.
              </p>
            </div>

            {/* Mensajes: flex-1 min-h-0 para adaptarse al viewport/teclado */}
            <div className="flex-1 min-h-0 space-y-4 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${
                    message.sender === 'user' ? 'justify-end' : ''
                  }`}
                >
                  {message.sender === 'luna' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-violet-600 dark:from-violet-500 dark:to-violet-600">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl p-3 ${
                      message.sender === 'user'
                        ? 'rounded-tr-none bg-gradient-to-r from-violet-600 to-violet-700 text-white'
                        : 'rounded-tl-none bg-[#f5f5f7] dark:bg-[#1a1a1a] text-[#1d1d1f] dark:text-[#fafafa]'
                    }`}
                  >
                    <p className="whitespace-pre-line text-sm">{message.text}</p>
                    <p className="mt-1 text-xs opacity-70">{message.time}</p>
                  </div>
                  {message.sender === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600" />
                  )}
                </div>
              ))}
              
              {/* Contador de mensajes */}
              {messageCount < 8 && (
                <div className="text-center">
                  <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
                    {messageCount}/8 mensajes
                  </p>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-[#e5e5e7] dark:border-[#262626] bg-[#f5f5f7] dark:bg-[#1a1a1a] p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    messageCount >= 8
                      ? 'Límite alcanzado'
                      : 'Pregunta a Luna...'
                  }
                  disabled={messageCount >= 8}
                  className="flex-1 rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-2 text-sm text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373] focus:border-violet-500 focus:outline-none disabled:opacity-50 transition-colors duration-150"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!canSendMessage}
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 px-4 py-2 text-white transition-all duration-150 hover:shadow-violet-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

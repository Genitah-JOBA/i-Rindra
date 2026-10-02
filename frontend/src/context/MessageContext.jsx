import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import MessageBox from '../components/MessageBox';

const MessageContext = createContext(null);

export function MessageProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const resolverRef = useRef(null);

  // ---------- Alertes empilées ----------
  const push = useCallback((type, message, opts = {}) => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((m) => [...m, { id, type, message, ...opts }]);
  }, []);

  const showSuccess = useCallback((msg, opts) => push('success', msg, opts), [push]);
  const showError   = useCallback((msg, opts) => push('error',   msg, opts), [push]);
  const showWarning = useCallback((msg, opts) => push('warning', msg, opts), [push]);
  const showInfo    = useCallback((msg, opts) => push('info',    msg, opts), [push]);

  const removeMessage = useCallback((id) => {
    setMessages((all) => all.filter((x) => x.id !== id));
  }, []);

  // ---------- Confirmation (Promise) ----------
  const showConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({ type: 'warning', ...opts });
    });
  }, []);

  const closeConfirm = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setConfirmState(null);
    if (resolve) resolve(result);
  }, []);

  const value = {
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm,
  };

  return (
    <MessageContext.Provider value={value}>
      {children}

      {/* Alertes empilées (en haut à droite) */}
      <div className="fixed top-4 right-4 z-[100] space-y-2 w-80 pointer-events-none">
        <div className="pointer-events-auto space-y-2">
          {messages.map((m) => (
            <MessageBox
              key={m.id}
              {...m}
              onClose={() => removeMessage(m.id)}
            />
          ))}
        </div>
      </div>

      {/* Boîte de confirmation modale */}
      {confirmState && (
        <ConfirmHost state={confirmState} onResult={closeConfirm} />
      )}
    </MessageContext.Provider>
  );
}

// ---------- Hôte de la confirmation (charte graphique i-Rindra) ----------
// Bleu nuit (#0B2241) pour le texte et le voile, liseré en dégradé de la
// marque (bleu ciel → vert → turquoise), pied menthe clair. Le bouton de
// validation reprend le dégradé des boutons d'action ; seule une action
// destructrice (type "error") reste en rouge pour être reconnaissable.
const ICONES_CONFIRM = {
  warning: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  error: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  success: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  info: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z',
};

const PASTILLES_CONFIRM = {
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
  success: 'bg-i-green/25 text-i-primary',
  info: 'bg-i-blue/15 text-i-blue',
};

function ConfirmHost({ state, onResult }) {
  const {
    type = 'warning',
    title = 'Confirmation',
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
  } = state;
  const destructif = type === 'error';
  const boutonConfirmer = useRef(null);

  // Clavier : Échap annule, Entrée confirme (focus sur « Confirmer » à l'ouverture)
  useEffect(() => {
    boutonConfirmer.current?.focus();
    const surTouche = (e) => {
      if (e.key === 'Escape') onResult(false);
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onResult]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-i-primary/60 backdrop-blur-[2px] p-4 animate__animated animate__fadeIn animate__faster"
      onClick={() => onResult(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-titre"
        aria-describedby="confirm-message"
        className="w-full max-w-md overflow-hidden bg-white shadow-2xl animate__animated animate__zoomIn animate__faster"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Liseré dégradé de la marque */}
        <div className="h-1.5 bg-gradient-to-r from-i-blue via-i-green to-i-turquoise" />

        <div className="flex items-start gap-4 px-6 pt-5 pb-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center ${PASTILLES_CONFIRM[type] || PASTILLES_CONFIRM.warning}`}>
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICONES_CONFIRM[type] || ICONES_CONFIRM.warning} />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="confirm-titre" className="font-brand text-lg font-bold text-i-primary">
              {title}
            </h3>
            <div id="confirm-message" className="mt-1 text-sm leading-relaxed text-slate-600">
              {message}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-i-turquoise/40 bg-[#EEFBF6] px-6 py-3">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="border border-i-primary/20 bg-white px-4 py-2 text-sm font-medium text-i-primary transition-colors hover:border-i-primary/40 hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={boutonConfirmer}
            type="button"
            onClick={() => onResult(true)}
            className={`px-4 py-2 text-sm font-semibold transition-all duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              destructif
                ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500'
                : 'bg-gradient-to-r from-i-blue to-i-green text-i-primary hover:scale-[1.02] focus-visible:ring-i-blue'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Hook ----------
export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error('useMessage doit être utilisé dans <MessageProvider>');
  }
  return ctx;
}
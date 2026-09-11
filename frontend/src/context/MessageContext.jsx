import { createContext, useCallback, useContext, useRef, useState } from 'react';
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

// ---------- Hôte de la confirmation ----------
function ConfirmHost({ state, onResult }) {
  const {
    type = 'warning',
    title = 'Confirmation',
    message,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
  } = state;

  const styles = {
    success: { bg: 'bg-green-50',  border: 'border-green-400',  text: 'text-green-800',  btn: 'bg-green-600 hover:bg-green-700' },
    error:   { bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-800',    btn: 'bg-red-600 hover:bg-red-700' },
    warning: { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800', btn: 'bg-amber-600 hover:bg-amber-700' },
    info:    { bg: 'bg-blue-50',   border: 'border-blue-400',   text: 'text-blue-800',   btn: 'bg-blue-600 hover:bg-blue-700' },
  }[type] || { bg: 'bg-yellow-50', border: 'border-yellow-400', text: 'text-yellow-800', btn: 'bg-amber-600 hover:bg-amber-700' };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 animate__animated animate__fadeIn"
      onClick={() => onResult(false)}
    >
      <div
        className={`w-full max-w-md bg-white p-6 shadow-xl rounded-lg animate__animated animate__zoomIn`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-3 mb-4 ${styles.text}`}>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>

        <div className="text-slate-600 mb-6">{message}</div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onResult(false)}
            className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResult(true)}
            className={`px-4 py-2 text-white rounded transition-colors ${styles.btn}`}
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
// src/context/MessageContext.jsx
import { createContext, useContext, useState, useCallback } from 'react';
import MessageBox from '../components/MessageBox';

const MessageContext = createContext(null);

export function MessageProvider({ children }) {
  const [messages, setMessages] = useState([]);

  const showMessage = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now() + Math.random();
    setMessages(prev => [...prev, { id, message, type, duration }]);
    
    setTimeout(() => {
      setMessages(prev => prev.filter(msg => msg.id !== id));
    }, duration);
  }, []);

  const showSuccess = useCallback((message, duration = 5000) => {
    showMessage(message, 'success', duration);
  }, [showMessage]);

  const showError = useCallback((message, duration = 5000) => {
    showMessage(message, 'error', duration);
  }, [showMessage]);

  const showWarning = useCallback((message, duration = 5000) => {
    showMessage(message, 'warning', duration);
  }, [showMessage]);

  const showInfo = useCallback((message, duration = 5000) => {
    showMessage(message, 'info', duration);
  }, [showMessage]);

  const removeMessage = useCallback((id) => {
    setMessages(prev => prev.filter(msg => msg.id !== id));
  }, []);

  const value = {
    showMessage,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    messages,
    removeMessage,
  };

  const showConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setConfirmState({
        type: 'warning',
        ...opts,
      });
    });
  }, []);

  const closeConfirm = (result) => {
    setConfirmState(null);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  return (
    <MessageContext.Provider value={value}>
      {children}
      {/* Afficher tous les messages en haut à droite */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {messages.map((msg) => (
          <div key={msg.id} className="pointer-events-auto w-full">
            <MessageBox
              type={msg.type}
              message={msg.message}
              onClose={() => removeMessage(msg.id)}
              autoClose={true}
              duration={msg.duration}
            />
          </div>
        ))}
      </div>
    </MessageContext.Provider>
  );
}

// Hook pour utiliser le contexte
export function useMessage() {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}
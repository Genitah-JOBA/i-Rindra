// src/components/MessageBox.jsx
import { useState, useEffect } from 'react';
import 'animate.css';

// Types de messages
const TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Icônes SVG
const ICONS = {
  success: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const COLORS = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    text: 'text-green-800',
    icon: 'text-green-400',
    button: 'hover:bg-green-200',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-800',
    icon: 'text-red-400',
    button: 'hover:bg-red-200',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-400',
    text: 'text-yellow-800',
    icon: 'text-yellow-400',
    button: 'hover:bg-yellow-200',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    text: 'text-blue-800',
    icon: 'text-blue-400',
    button: 'hover:bg-blue-200',
  },
};

// Composant MessageBox
export default function MessageBox({
  type = 'info',
  message,
  title,
  onClose,
  autoClose = false,
  duration = 5000,
  className = '',
  dismissible = true,

  mode = 'alert',
  onConfirm,
  onCancel,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
}) {
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);

  const color = COLORS[type] || COLORS.info;
  const icon = ICONS[type] || ICONS.info;

  useEffect(() => {
    if (autoClose && visible) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoClose, duration, visible]);

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, 300);
  };

  if (!visible) return null;

  return (
    <div
      className={`
        ${color.bg} border ${color.border} rounded-lg p-4 shadow-lg
        animate__animated animate__fadeIn
        ${closing ? 'animate__animated animate__fadeOut' : ''}
        ${className}
      `}
      role="alert"
    >
      <div className="flex items-start">
        <div className={`flex-shrink-0 ${color.icon}`}>
          {icon}
        </div>

        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${color.text}`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${color.text} ${title ? 'mt-1' : ''}`}>
            {message}
          </div>
        </div>

        {mode === 'confirm' ? (
          <div className="ml-auto flex gap-2 mt-4">
            <button
              onClick={() => { setClosing(true); setTimeout(() => { setVisible(false); onCancel?.(); }, 300); }}
              className={`px-3 py-1.5 text-sm border border-slate-300 rounded text-slate-600 hover:bg-slate-50`}
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => { setClosing(true); setTimeout(() => { setVisible(false); onConfirm?.(); }, 300); }}
              className={`px-3 py-1.5 text-sm rounded text-white ${
                type === 'error' ? 'bg-red-600 hover:bg-red-700' :
                type === 'warning' ? 'bg-amber-600 hover:bg-amber-700' :
                type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        ) : dismissible && (
          <button
            type="button"
            onClick={handleClose}
            className={`ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 inline-flex ${color.text} ${color.button} transition-colors`}
            aria-label="Fermer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
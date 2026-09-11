// src/pages/AssistantIA.jsx — Interface de chat avec l'assistant IA.
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLang } from "../i18n/LangContext";
import { useMessage } from "../context/MessageContext";
import { iaService } from "../api/ia";

// Icône envoi (papier plié)
function IconSend({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

// Icône poubelle
function IconTrash({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

// Icône éclair (suggestions)
function IconBolt({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  );
}

const SUGGESTIONS = [
  "Résume l'avancement de mes projets",
  "Quels projets sont en retard ?",
  "Donne-moi des conseils pour organiser mon équipe",
  "Comment calculer l'avancement d'un projet ?",
];

export default function AssistantIA() {
  const { user } = useAuth();
  const { t } = useLang();
  const { showError } = useMessage();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll automatique vers le bas
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Vérifier la config IA au chargement
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await iaService.status();
        setConfig(status);
      } catch {
        setConfig({ configuree: false, modele: "inconnu" });
      }
    };
    checkStatus();
  }, []);

  // Envoyer un message
  const handleSend = async (text = null) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    const userMsg = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Envoie l'historique (sans le system prompt, c'est géré côté backend)
      const historique = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await iaService.chat(messageText, historique);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.reponse },
      ]);
    } catch (err) {
      const detail =
        err.response?.data?.detail || "Erreur de connexion à l'assistant IA.";
      showError(detail);
      // Retire le message utilisateur en cas d'erreur
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  // Touche Entrée pour envoyer
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Effacer la conversation
  const handleClear = () => {
    setMessages([]);
  };

  const estConfigure = config?.configuree === true;

  return (
    <div className="animate__animated animate__fadeIn w-full flex flex-col h-[calc(100vh-4rem)]">
      {/* En-tête */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <IconBolt className="w-6 h-6 text-purple-600" />
            {t("ia.titre")}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t("ia.sousTitre")}</p>
        </div>
        <div className="flex items-center gap-3">
          {config && (
            <span
              className={`text-xs px-2 py-1 ${
                estConfigure
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {estConfigure ? config.modele : "Non configuré"}
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
              title={t("ia.effacer")}
            >
              <IconTrash className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Zone de messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center animate__animated animate__fadeInUp">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <IconBolt className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              {t("ia.bienvenue")}
            </h2>
            <p className="text-sm text-slate-500 max-w-md mb-6">
              {t("ia.bienvenueDesc")}
            </p>

            {!estConfigure && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 max-w-md text-sm mb-6">
                {t("ia.nonConfigure")}
              </div>
            )}

            {/* Suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  disabled={!estConfigure || loading}
                  className="text-left text-sm px-4 py-3 bg-slate-50 hover:bg-purple-50 hover:text-purple-700 border border-slate-200 hover:border-purple-300 transition-colors text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            } animate__animated animate__fadeIn`}
          >
            <div
              className={`max-w-[75%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[#63B23E] text-white"
                  : "bg-slate-100 text-slate-800 border border-slate-200"
              }`}
            >
              {msg.role === "assistant" && (
                <span className="block text-[10px] font-semibold text-purple-600 uppercase mb-1">
                  IA
                </span>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate__animated animate__fadeIn">
            <div className="bg-slate-100 border border-slate-200 px-4 py-3 text-sm text-slate-500">
              <span className="inline-flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>●</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>●</span>
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Zone de saisie */}
      <div className="border-t border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("ia.placeholder")}
            disabled={!estConfigure || loading}
            rows={1}
            className="flex-1 resize-none border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || !estConfigure || loading}
            className="p-3 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <IconSend className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          {t("ia.avertissement")}
        </p>
      </div>
    </div>
  );
}

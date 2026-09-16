// src/pages/AssistantIA/ChatTab.jsx — conversation avec l'assistant IA.
import { useState, useRef, useEffect } from "react";
import { useMessage } from "../../context/MessageContext";
import { iaService } from "../../api/ia";
import { IconSparkles, IconCheck, IconArrowRight } from "./Shared";

function IconSend({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  );
}

function IconTrash({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

const SUGGESTIONS = [
  "Résume l'avancement de mes projets",
  "Quels projets sont en retard ?",
  "Donne-moi des conseils pour organiser mon équipe",
  "Comment calculer l'avancement d'un projet ?",
];

export default function ChatTab() {
  const { showError } = useMessage();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const scrollContainerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

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

  const handleSend = async (text = null) => {
    const messageText = (text || input).trim();
    if (!messageText || loading) return;

    const userMsg = { role: "user", content: messageText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const historique = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const result = await iaService.chat(messageText, historique);

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.reponse,
          noteDevis: result.suggestion_devis_sauvee === true,
        },
      ]);
    } catch (err) {
      const detail =
        err.response?.data?.detail || "Erreur de connexion à l'assistant IA.";
      showError(detail);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => setMessages([]);

  const estConfigure = config?.configuree === true;

  return (
    <div className="flex flex-col h-[62vh] overflow-hidden bg-slate-50 border border-slate-200 rounded-lg">
      {/* Zone scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-8 animate__animated animate__fadeInUp">
                <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mb-3">
                  <IconSparkles className="w-7 h-7 text-purple-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">
                  Bonjour ! Je suis votre assistant IA.
                </h2>
                <p className="text-sm text-slate-500 max-w-md mb-5">
                  Je peux vous aider avec vos projets, tâches, délais et
                  organisation. Posez-moi une question ou choisissez une
                  suggestion ci-dessous.
                </p>

                {!estConfigure && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 max-w-md text-sm mb-5 rounded-lg">
                    L'assistant IA n'est pas configuré. Demandez à un
                    administrateur de définir la clé API OpenAI dans le fichier
                    .env du backend.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      disabled={!estConfigure || loading}
                      className="text-left text-sm px-4 py-3 bg-white hover:bg-purple-50 hover:text-purple-700 border border-slate-200 hover:border-purple-300 transition-colors text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate__animated animate__fadeIn`}>
                <div className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-lg ${msg.role === "user" ? "bg-[#63B23E] text-white" : "bg-white text-slate-800 border border-slate-200"}`}>
                  {msg.role === "assistant" && (
                    <span className="block text-[10px] font-semibold text-purple-600 uppercase mb-1">IA</span>
                  )}
                  {msg.content}
                  {msg.noteDevis && (
                    <a href="/suggestion-devis" className="mt-2 flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-md hover:bg-purple-100 transition-colors">
                      <IconCheck className="w-3.5 h-3.5 flex-shrink-0" />
                      Devis sauvegardé dans « Suggestion devis par IA »
                      <IconArrowRight className="w-3.5 h-3.5 flex-shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start animate__animated animate__fadeIn">
                <div className="bg-white border border-slate-200 px-4 py-3 text-sm text-slate-500 rounded-lg">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Zone de saisie */}
      <footer className="border-t border-slate-200 bg-white px-4 py-3 flex-shrink-0">
        <div className="flex items-end gap-3 max-w-2xl mx-auto">
          <span>{config && <span className={`hidden md:inline-flex text-[10px] px-2 py-1 rounded-full ${estConfigure ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{estConfigure ? config.modele : "Non configuré"}</span>}</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre message…"
            disabled={!estConfigure || loading}
            rows={1}
            className="flex-1 resize-none border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed rounded-lg"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || !estConfigure || loading}
            className="p-3 bg-purple-600 text-white hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex-shrink-0 rounded-lg"
          >
            <IconSend className="w-5 h-5" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 flex-shrink-0"
              title="Effacer la conversation"
            >
              <IconTrash className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          Les réponses sont générées par une IA et peuvent contenir des erreurs. Vérifiez les informations importantes.
        </p>
      </footer>
    </div>
  );
}
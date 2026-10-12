// src/pages/AssistantIA/ChatTab.jsx — conversation avec l'assistant IA,
// avec historique des conversations (enregistrées côté serveur, par utilisateur).
import { useState, useRef, useEffect } from "react";
import { useMessage } from "../../context/MessageContext";
import { iaService } from "../../api/ia";
import { IconSparkles, IconCheck, IconArrowRight } from "./Shared";
import ReponseIA from "../../components/ReponseIA";

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

function IconPlus({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconHistorique({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// Regroupe les conversations par ancienneté pour la liste latérale.
function groupeDate(iso) {
  if (!iso) return "Plus ancien";
  const d = new Date(iso);
  const auj = new Date();
  const debutJour = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate());
  const jours = Math.floor((debutJour - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (jours <= 0) return "Aujourd'hui";
  if (jours === 1) return "Hier";
  if (jours < 7) return "7 derniers jours";
  if (jours < 30) return "30 derniers jours";
  return "Plus ancien";
}

const SUGGESTIONS = [
  "Résume l'avancement de mes projets",
  "Quels projets sont en retard ?",
  "Donne-moi des conseils pour organiser mon équipe",
  "Comment calculer l'avancement d'un projet ?",
];

export default function ChatTab() {
  const { showError, showConfirm } = useMessage();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);
  const [contexteProjets, setContexteProjets] = useState(null);
  // Historique : liste des conversations et conversation ouverte (null = nouvelle)
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [ouvertureId, setOuvertureId] = useState(null);
  const [historiqueVisible, setHistoriqueVisible] = useState(false); // mobile
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
    iaService.conversations().then(setConversations).catch(() => {});
  }, []);

  const rafraichirConversations = () =>
    iaService.conversations().then(setConversations).catch(() => {});

  const nouvelleConversation = () => {
    setMessages([]);
    setConversationId(null);
    setHistoriqueVisible(false);
    inputRef.current?.focus();
  };

  const ouvrirConversation = async (id) => {
    if (loading || id === conversationId) {
      setHistoriqueVisible(false);
      return;
    }
    setOuvertureId(id);
    try {
      const conv = await iaService.conversation(id);
      setMessages(
        conv.messages.map((m) => ({ role: m.role, content: m.content, noteDevis: m.devis_sauve })),
      );
      setConversationId(conv.id);
      setHistoriqueVisible(false);
    } catch (err) {
      showError(err.response?.data?.detail || "Impossible d'ouvrir cette conversation.");
    } finally {
      setOuvertureId(null);
    }
  };

  const supprimerConversation = async (conv) => {
    const ok = await showConfirm({
      type: "error",
      title: "Supprimer la conversation",
      message: `Supprimer définitivement la conversation « ${conv.titre} » ?`,
      confirmLabel: "Supprimer",
      cancelLabel: "Annuler",
    });
    if (!ok) return;
    try {
      await iaService.supprimerConversation(conv.id);
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (conv.id === conversationId) nouvelleConversation();
    } catch (err) {
      showError(err.response?.data?.detail || "Suppression impossible.");
    }
  };

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

      const result = await iaService.chat(messageText, historique, conversationId);
      if (result.conversation_id) {
        setConversationId(result.conversation_id);
        rafraichirConversations();
      }

      if (result.nb_projets_contexte != null) {
        setContexteProjets(result.nb_projets_contexte);
      }

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

  const estConfigure = config?.configuree === true;

  return (
    <div className="relative flex h-[62vh] overflow-hidden border border-slate-200 bg-slate-50">
      {/* Historique des conversations */}
      <aside
        className={`${historiqueVisible ? "flex" : "hidden"} absolute inset-y-0 left-0 z-10 w-64 flex-col border-r border-slate-200 bg-white shadow-lg md:static md:flex md:shadow-none`}
      >
        <div className="border-b border-slate-200 p-3">
          <button
            onClick={nouvelleConversation}
            disabled={loading}
            className="flex w-full items-center justify-center gap-1.5 bg-brand-gradient px-3 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
          >
            <IconPlus className="h-4 w-4" />
            Nouvelle conversation
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              Aucune conversation enregistrée.
            </p>
          ) : (
            conversations.map((c, i) => {
              const groupe = groupeDate(c.modifie_le);
              const actif = c.id === conversationId;
              return (
                <div key={c.id}>
                  {(i === 0 || groupeDate(conversations[i - 1].modifie_le) !== groupe) && (
                    <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {groupe}
                    </p>
                  )}
                  <div
                    className={`group flex items-center gap-1 border-l-2 pr-1 ${
                      actif ? "border-i-blue bg-i-blue/10" : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <button
                      onClick={() => ouvrirConversation(c.id)}
                      className={`min-w-0 flex-1 px-3 py-2 text-left text-sm ${actif ? "font-semibold text-i-primary" : "text-slate-600"}`}
                      title={c.titre}
                    >
                      <span className="block truncate">{ouvertureId === c.id ? "Ouverture…" : c.titre}</span>
                    </button>
                    <button
                      onClick={() => supprimerConversation(c)}
                      className="p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                      title="Supprimer la conversation"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
      {/* Bouton historique (mobile) */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 md:hidden">
        <button
          onClick={() => setHistoriqueVisible((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600"
        >
          <IconHistorique className="h-4 w-4" />
          Historique
        </button>
        <button onClick={nouvelleConversation} className="p-1 text-i-blue" title="Nouvelle conversation">
          <IconPlus className="h-5 w-5" />
        </button>
      </div>
      {/* Zone scrollable */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-8 animate__animated animate__fadeInUp">
                 <div className="w-14 h-14 bg-i-blue/10 flex items-center justify-center mb-3">
                  <IconSparkles className="w-7 h-7 text-i-blue" />
                </div>
                <h2 className="text-lg font-semibold text-slate-800 mb-2">
                  Bonjour ! Je suis votre assistant IA.
                </h2>
                <p className="text-sm text-slate-500 max-w-md mb-5">
                  Je peux vous aider avec vos projets, tâches, délais et
                  organisation. Posez-moi une question ou choisissez une
                  suggestion ci-dessous.
                </p>

                <p className="text-[11px] text-slate-400 max-w-md mb-4 text-center">
                  L'assistant est connecté à vos projets : il voit en temps réel
                  leurs tâches, échéances et retards.
                </p>

                {!estConfigure && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 max-w-md text-sm mb-5">
                    L'assistant IA n'est pas configuré. Demandez à un
                    administrateur de définir LLM_API_KEY dans le fichier
                    .env du backend.
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(s)}
                      disabled={!estConfigure || loading}
                      className="text-left text-sm px-4 py-3 bg-white hover:bg-i-blue/5 hover:text-i-blue border border-slate-200 hover:border-i-blue transition-colors text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate__animated animate__fadeIn`}>
                <div className={`max-w-[78%] px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "whitespace-pre-wrap " : ""}${msg.role === "user" ? "bg-brand-gradient text-i-primary" : "bg-white text-slate-800 border border-slate-200"}`}>
                  {msg.role === "assistant" && (
                    <span className="block text-[10px] font-semibold text-i-blue uppercase mb-1">IA</span>
                  )}
                  {msg.role === "assistant" ? <ReponseIA texte={msg.content} /> : msg.content}
                  {msg.noteDevis && (
                    <a href="/suggestion-devis" className="mt-2 flex items-center gap-1 text-[11px] font-medium text-i-blue bg-i-blue/10 border border-i-blue/30 px-3 py-1.5 hover:bg-brand-gradient/20 transition-colors">
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
                <div className="bg-white border border-slate-200 px-4 py-3 text-sm text-slate-500">
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
          <span>{config && <span className={`hidden md:inline-flex text-[10px] px-2 py-1 ${estConfigure ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{estConfigure ? config.modele : "Non configuré"}</span>}</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrivez votre message…"
            disabled={!estConfigure || loading}
            rows={1}
            className="flex-1 resize-none border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-i-blue focus:border-transparent disabled:bg-slate-50 disabled:cursor-not-allowed"
            style={{ minHeight: "44px", maxHeight: "120px" }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || !estConfigure || loading}
            className="p-3 bg-brand-gradient text-black hover:brightness-110 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <IconSend className="w-5 h-5" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={nouvelleConversation}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-i-blue transition-colors hover:bg-i-blue/10 flex-shrink-0 disabled:opacity-40"
              title="Nouvelle conversation (celle-ci reste dans l'historique)"
            >
              <IconPlus className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400 text-center mt-2">
          {contexteProjets != null
            ? `Contexte chargé : ${contexteProjets} projet(s) actif(s) — ${estConfigure ? config.modele : "IA non configurée"}`
            : "Les réponses sont générées par une IA et peuvent contenir des erreurs. Vérifiez les informations importantes."}
        </p>
      </footer>
      </div>
    </div>
  );
}

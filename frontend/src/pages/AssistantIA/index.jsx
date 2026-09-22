// src/pages/AssistantIA/index.jsx — hub de l'assistant IA.
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useMessage } from "../../context/MessageContext";
import { projetsService } from "../../api/projets";
import { iaService } from "../../api/ia";
import {
  IconSparkles,
  IconChatBubble,
  IconDocumentText,
  IconList,
  IconChartBar,
  IconUsers,
  IconSearch,
} from "./Shared";
import ChatTab from "./ChatTab";
import AnalyseCdcTab from "./AnalyseCdcTab";
import ExtractionTab from "./ExtractionTab";
import AnalyseProjetTab from "./AnalyseProjetTab";
import AffectationTab from "./AffectationTab";
import RechercheTab from "./RechercheTab";

const estGestion = (role) => ["direction", "drh", "chef_de_projet"].includes(role);

export default function AssistantIA() {
  const { user } = useAuth();
  const { showError } = useMessage();

  const [projets, setProjets] = useState([]);
  const [projetsCharge, setProjetsCharge] = useState(false);
  const [config, setConfig] = useState(null);
  const [onglet, setOnglet] = useState("chat");

  useEffect(() => {
    projetsService
      .list()
      .then(setProjets)
      .catch(() => showError("Impossible de charger la liste des projets."))
      .finally(() => setProjetsCharge(true));
    iaService
      .status()
      .then(setConfig)
      .catch(() => setConfig({ configuree: false, modele: "inconnu" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gestion = estGestion(user?.role);

  const ONGLETS = useMemo(
    () =>
      [
        { id: "chat", label: "Assistant", Icon: IconChatBubble, requis: true, render: () => <ChatTab /> },
        { id: "analyse", label: "Analyser un CDC", Icon: IconDocumentText, requis: gestion, render: () => <AnalyseCdcTab projets={projets} /> },
        { id: "extraction", label: "Tâches suggérées", Icon: IconList, requis: gestion, render: () => <ExtractionTab projets={projets} /> },
        { id: "projet", label: "Analyse du projet", Icon: IconChartBar, requis: true, render: () => <AnalyseProjetTab projets={projets} gestion={gestion} /> },
        { id: "affectation", label: "Affectation", Icon: IconUsers, requis: gestion, render: () => <AffectationTab projets={projets} /> },
        { id: "recherche", label: "Recherche", Icon: IconSearch, requis: true, render: () => <RechercheTab projets={projets} /> },
      ].filter((o) => o.requis),
    [gestion, projets]
  );

  const actif = ONGLETS.find((o) => o.id === onglet) ?? ONGLETS[0];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* En-tête compact */}
      <header className="flex-shrink-0 flex items-center gap-3 px-1 pb-3">
        <div className="w-9 h-9 bg-i-blue/10 rounded-lg flex items-center justify-center flex-shrink-0">
          <IconSparkles className="w-4 h-4 text-i-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-slate-900 leading-tight">Assistant IA</h1>
          <p className="text-xs text-slate-500 truncate">L'IA propose, l'humain valide.</p>
        </div>
        {config && !config.configuree && (
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-600 whitespace-nowrap">
            IA non configurée
          </span>
        )}
      </header>

      {/* Navigation par onglets */}
      <nav className="flex-shrink-0 flex flex-wrap gap-1.5 pb-3 border-b border-slate-200">
        {ONGLETS.map((o) => {
          const isActive = actif.id === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-all rounded-md ${
                isActive
                  ? "bg-brand-gradient text-i-primary shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-i-blue hover:text-i-blue hover:bg-i-blue/5"
              }`}
            >
              <o.Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{o.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Contenu de l'onglet actif */}
      <section className="flex-1 min-h-0 overflow-hidden pt-4">
        {!projetsCharge ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-i-blue" />
              <p className="text-sm text-slate-400">Chargement des projets…</p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-hidden">{actif.render()}</div>
        )}
      </section>
    </div>
  );
}
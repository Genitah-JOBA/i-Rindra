// src/pages/AssistantIA/index.jsx — hub de l'assistant IA.
import { useState, useEffect } from "react";
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

  const ONGLETS = [
    { id: "chat", label: "Assistant", Icon: IconChatBubble, requis: true, render: () => <ChatTab /> },
    { id: "analyse", label: "Analyser un CDC", Icon: IconDocumentText, requis: gestion, render: () => <AnalyseCdcTab projets={projets} /> },
    { id: "extraction", label: "Tâches suggérées", Icon: IconList, requis: gestion, render: () => <ExtractionTab projets={projets} /> },
    { id: "projet", label: "Analyse du projet", Icon: IconChartBar, requis: true, render: () => <AnalyseProjetTab projets={projets} gestion={gestion} /> },
    { id: "affectation", label: "Affectation", Icon: IconUsers, requis: gestion, render: () => <AffectationTab projets={projets} /> },
    { id: "recherche", label: "Recherche", Icon: IconSearch, requis: true, render: () => <RechercheTab projets={projets} /> },
  ].filter((o) => o.requis);

  const actif = ONGLETS.find((o) => o.id === onglet) ?? ONGLETS[0];

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <div className="w-10 h-10 bg-[#63B23E]/10 rounded-full flex items-center justify-center flex-shrink-0">
          <IconSparkles className="w-5 h-5 text-[#63B23E]" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">Assistant IA</h1>
          <p className="text-sm text-slate-500">L'IA propose, l'humain valide.</p>
        </div>
        {config && !config.configuree && (
          <span className="text-[11px] px-3 py-1 rounded-full bg-red-50 border border-red-200 text-red-600">
            IA non configurée
          </span>
        )}
      </header>

      <nav className="mb-6 flex flex-wrap gap-1.5">
        {ONGLETS.map((o) => {
          const isActive = actif.id === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors rounded-md ${
                isActive
                  ? "bg-[#63B23E] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-[#63B23E] hover:text-[#3f7c28]"
              }`}
            >
              <o.Icon className="w-4 h-4" />
              {o.label}
            </button>
          );
        })}
      </nav>

      {!projetsCharge ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
        </div>
      ) : (
        <section>{actif.render()}</section>
      )}
    </div>
  );
}
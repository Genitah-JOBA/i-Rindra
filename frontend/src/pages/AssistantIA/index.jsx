// src/pages/AssistantIA/index.jsx — hub de l'assistant IA.
// Les onglets de pilotage (adaptées aux perms du backend) sont réservés à la gestion,
// le chat / résumé / recherche sont ouverts à tous les comptes internes.
import { useState, useEffect } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useMessage } from "../../context/MessageContext";
import { projetsService } from "../../api/projets";
import { iaService } from "../../api/ia";
import { IconSparkles } from "./Shared";
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
    { id: "chat", label: "💬 Assistant", requis: true, render: () => <ChatTab /> },
    { id: "analyse", label: "📝 Analyser un CDC", requis: gestion, render: () => <AnalyseCdcTab projets={projets} /> },
    { id: "extraction", label: "🧩 Tâches suggérées", requis: gestion, render: () => <ExtractionTab projets={projets} /> },
    { id: "resume", label: "📊 Résumé", requis: true, render: () => <AnalyseProjetTab variante="resume" projets={projets} /> },
    { id: "detec", label: "🚨 Retards & blocages", requis: gestion, render: () => <AnalyseProjetTab variante="detec" projets={projets} /> },
    { id: "statut", label: "🩺 Statut santé", requis: gestion, render: () => <AnalyseProjetTab variante="statut" projets={projets} /> },
    { id: "affectation", label: "👥 Affectation", requis: gestion, render: () => <AffectationTab projets={projets} /> },
    { id: "recherche", label: "🔍 Recherche", requis: true, render: () => <RechercheTab projets={projets} /> },
  ].filter((o) => o.requis);

  const actif = ONGLETS.find((o) => o.id === onglet) ?? ONGLETS[0];

  return (
    <div>
      {/* En-tête du module */}
      <header className="mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
            <IconSparkles className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-slate-900">Assistant IA</h1>
            <p className="text-sm text-slate-500">
              L'IA propose, l'humain valide — analyse, suggestions, alertes et aide à la décision.
            </p>
          </div>
          <span className={`hidden md:inline-flex text-[11px] px-3 py-1 rounded-full ${config?.configuree ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {config?.configuree
              ? `✓ IA configurée · ${config.modele}`
              : "✗ IA non configurée"}
          </span>
        </div>

        {/* Barre d'onglets */}
        <nav className="mt-5 flex flex-wrap gap-1.5">
          {ONGLETS.map((o) => (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              className={`px-3.5 py-2 text-sm font-medium transition rounded-lg ${
                actif.id === o.id
                  ? "bg-[#63B23E] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-[#63B23E] hover:text-[#3f7c28]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Contenu de l'onglet actif */}
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
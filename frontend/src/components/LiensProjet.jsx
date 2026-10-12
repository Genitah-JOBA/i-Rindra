// src/components/LiensProjet.jsx — accès aux applications liées depuis un projet :
//   - « Chat du projet » vers i-Resaka (RF-20 / RF-32), pour tous ;
//   - « Estimation » vers B-esti (RF-34), réservé à la direction / DRH
//     (cahier des charges : le bouton n'est pas présenté au chef de projet) ;
//   - « Mes devis » vers B-esti pour le client (RF-21).
import { useAuth } from "../auth/AuthContext";
import { BESTI_URL, lienChatProjet } from "../config/liens";

const IconeChat = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
);

const IconeDevis = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="h-4 w-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h12m-12 2.25h12M3.375 4.5h17.25c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125H3.375a1.125 1.125 0 01-1.125-1.125V5.625c0-.621.504-1.125 1.125-1.125z" />
  </svg>
);

const BOUTON =
  "inline-flex items-center gap-2 border border-i-primary/20 bg-white px-3 py-2 text-sm font-medium text-i-primary transition-colors hover:border-i-blue hover:bg-[#EEFBF6]";

export default function LiensProjet({ projetId, className = "" }) {
  const { user } = useAuth();
  const role = user?.role;
  const estFinance = role === "direction" || role === "drh";
  const estClient = role === "client";

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a href={lienChatProjet(projetId)} target="_blank" rel="noopener noreferrer" className={BOUTON}
         title="Ouvrir le chat du projet dans i-Resaka">
        <IconeChat />
        Chat du projet
      </a>
      {(estFinance || estClient) && (
        <a href={BESTI_URL} target="_blank" rel="noopener noreferrer" className={BOUTON}
           title={estClient ? "Consulter vos devis dans B-estimation" : "Ouvrir l'estimation dans B-estimation"}>
          <IconeDevis />
          {estClient ? "Mes devis" : "Estimation"}
        </a>
      )}
    </div>
  );
}

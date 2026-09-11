// src/pages/Clients.jsx — affichage des clients (= entreprises), avec leur accès de connexion.
import { useEffect, useState } from "react";
import { clientsService } from "../api/client";
import { utilisateursService } from "../api/utilisateurs";
import { useMessage } from "../context/MessageContext";
import 'animate.css';

// Icônes SVG
const TrashIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

const EditIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

const SearchIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

const CloseIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const BuildingIcon = ({ className = "w-5 h-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M3.75 21V6.75A2.25 2.25 0 016 4.5h12a2.25 2.25 0 012.25 2.25V21m-13.5 0h10.5m-10.5 0v-9.75A2.25 2.25 0 016 9h12a2.25 2.25 0 012.25 2.25V21" />
  </svg>
);

const UserIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
);

const PhoneIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);

const MailIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const XIcon = ({ className = "w-4 h-4" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export default function Clients() {
  const { showSuccess, showError } = useMessage();

  const [entreprises, setEntreprises] = useState([]);
  const [comptes, setComptes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [recherche, setRecherche] = useState("");

  const chargerTout = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [ent, users] = await Promise.all([
        clientsService.list(),
        utilisateursService.list().catch(() => []),
      ]);
      setEntreprises(ent || []);
      setComptes((users || []).filter((u) => u.role === "client"));
    } catch (err) {
      const msg = err.response?.data?.detail || "Erreur de chargement.";
      setErreur(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerTout();
  }, []);

  const compteDe = (clientId) => comptes.find((c) => c.client_id === clientId);

  const filtres = entreprises.filter((e) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      e.nom?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.contact?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="animate__animated animate__fadeIn w-full px-4 sm:px-6 lg:px-8">
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate__animated animate__fadeInDown">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {"Clients"}
          </h1>
          <p className="text-sm text-slate-500">
            {entreprises.length} {"Les entreprises clientes et leur accès à l'espace client."}
          </p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder={"Rechercher…"}
            className="w-48 sm:w-56 pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-[#63B23E] focus:border-transparent"
          />
          <SearchIcon className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12 animate__animated animate__pulse">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#63B23E]"></div>
          <span className="ml-3 text-slate-500">{"Chargement…"}</span>
        </div>
      )}
      {erreur && (
        <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200 animate__animated animate__shakeX">
          ⚠️ {erreur}
        </div>
      )}

      {!loading && !erreur && (
        <>
          {filtres.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtres.map((e, index) => {
                const compte = compteDe(e.id);
                return (
                  <div
                    key={e.id}
                    className="border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-[#63B23E] transition-all duration-300 rounded-lg animate__animated animate__fadeInUp"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-amber-100 text-amber-700 rounded-full">
                        <BuildingIcon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">
                          {e.nom}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MailIcon className="w-3 h-3" />
                          <span className="truncate">{e.email || "—"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                      {e.contact && (
                        <div className="flex items-center gap-1">
                          <UserIcon className="w-3.5 h-3.5" />
                          <span>{e.contact}</span>
                        </div>
                      )}
                      {e.telephone && (
                        <div className="flex items-center gap-1">
                          <PhoneIcon className="w-3.5 h-3.5" />
                          <span>{e.telephone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-1 pt-1 border-t border-slate-100">
                        {compte ? (
                          <>
                            <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-green-600">{compte.email}</span>
                          </>
                        ) : (
                          <>
                            <XIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-slate-400">{"aucun"}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
              <BuildingIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">{"Aucun client."}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
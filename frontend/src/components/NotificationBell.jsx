// src/components/NotificationBell.jsx — cloche de notifications (compteur + liste).
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { notificationsService } from "../api/notifications";

const formatDate = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const rafraichirCount = () => {
    notificationsService.count().then(setCount).catch(() => {});
  };

  // Rafraîchit le compteur au montage puis toutes les 30 s
  useEffect(() => {
    rafraichirCount();
    const t = setInterval(rafraichirCount, 30000);
    return () => clearInterval(t);
  }, []);

  // Ferme le menu au clic extérieur
  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const basculer = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        setItems(await notificationsService.list());
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
  };

  const clic = async (n) => {
    try {
      if (!n.lu) {
        await notificationsService.markRead(n.id);
        rafraichirCount();
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
    if (n.lien) navigate(n.lien);
  };

  const toutLire = async () => {
    try {
      await notificationsService.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, lu: true })));
      setCount(0);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={basculer}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold text-slate-800">Notifications</span>
            {items.some((n) => !n.lu) && (
              <button onClick={toutLire} className="text-xs text-[#00B2A0] hover:underline">
                Tout marquer lu
              </button>
            )}
          </div>

          {loading && <p className="p-4 text-sm text-slate-500">Chargement…</p>}
          {!loading && items.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Aucune notification.</p>
          )}

          <ul className="divide-y">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => clic(n)}
                  className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${
                    n.lu ? "text-slate-500" : "bg-[#00B2A0]/5 font-medium text-slate-800"
                  }`}
                >
                  {n.message}
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {formatDate(n.cree_le)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

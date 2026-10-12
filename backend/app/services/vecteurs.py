# app/services/vecteurs.py
"""
Recherche sémantique dans un projet (RF-31) — pgvector + embeddings locaux.

Principe :
  - Chaque contenu d'un projet (tâche, commentaire, jalon, fichier) est découpé
    en passages, transformé en vecteur par un modèle LOCAL (fastembed / ONNX,
    multilingue) et stocké dans `document_chunk`.
  - L'index est synchronisé à la demande, juste avant une recherche : seuls les
    contenus nouveaux ou modifiés sont ré-encodés (empreinte SHA-256), les
    contenus supprimés sont retirés. Aucun routeur n'a donc à prévenir l'index.
  - La requête est encodée de la même façon puis comparée par similarité
    cosinus (opérateur `<=>` de pgvector, index HNSW).

Dégradation gracieuse (RNF-05) : si l'extension `vector` est absente (ex.
hébergement mutualisé) ou si le modèle ne peut pas être chargé, `disponible()`
renvoie False et la recherche reste en plein texte.

La table n'est volontairement PAS un modèle SQLAlchemy : `create_all` tenterait
de la créer avec le type `vector` et ferait échouer le démarrage sur une base
sans pgvector. Tout passe par du SQL explicite.
"""
import asyncio
import hashlib
import logging
from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.models import CommentaireTache, Fichier, Jalon, Tache, Utilisateur
from app.services.texte_documents import extraire_texte_fichier_stocke

logger = logging.getLogger(__name__)

TAILLE_PASSAGE = 400        # caractères par passage : court, car un modèle « statique » moyenne les mots
CHEVAUCHEMENT = 80          # recouvrement entre passages pour ne pas couper une idée
MAX_PASSAGES_PAR_SOURCE = 150   # ~60 000 caractères : un long cahier des charges entier

_pgvector_ok = False        # positionné au démarrage par preparer_base()
_modele = None
_modele_en_echec = False
_verrou_modele = asyncio.Lock()


def disponible() -> bool:
    """La recherche vectorielle est-elle utilisable ?"""
    return settings.RECHERCHE_VECTORIELLE and _pgvector_ok and not _modele_en_echec


# ============================================================
# Base de données
# ============================================================

async def preparer_base(conn: AsyncConnection) -> bool:
    """
    Prépare `document_chunk` (idempotent). Appelé au démarrage.

    - active l'extension `vector` si possible ;
    - crée / complète la table ;
    - si la dimension du modèle a changé, vide et recrée la colonne embedding
      (l'index n'est qu'une donnée dérivée, il se reconstruit tout seul) ;
    - remplace l'ancien index IVFFlat (inadapté à une table qui démarre vide)
      par un index HNSW.
    """
    global _pgvector_ok
    if not settings.RECHERCHE_VECTORIELLE:
        return False

    dim = int(settings.EMBEDDING_DIM)
    try:
        async with conn.begin_nested():
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as exc:  # noqa: BLE001
        logger.warning("pgvector indisponible (%s) : recherche en plein texte uniquement.", exc)
        _pgvector_ok = False
        return False

    async with conn.begin_nested():
        await conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS document_chunk (
                id          BIGSERIAL PRIMARY KEY,
                projet_id   BIGINT REFERENCES projet(id) ON DELETE CASCADE,
                source      TEXT,
                contenu     TEXT NOT NULL,
                embedding   vector({dim})
            )
        """))
        for ddl in (
            "ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)",
            "ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS source_id BIGINT",
            "ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS empreinte VARCHAR(64)",
            "ALTER TABLE document_chunk ADD COLUMN IF NOT EXISTS cree_le TIMESTAMPTZ NOT NULL DEFAULT now()",
        ):
            await conn.execute(text(ddl))

        # Dimension actuelle de la colonne (atttypmod = dimension pour `vector`)
        dim_actuelle = (await conn.execute(text("""
            SELECT atttypmod FROM pg_attribute
            WHERE attrelid = 'document_chunk'::regclass AND attname = 'embedding'
        """))).scalar()
        if dim_actuelle != dim:
            logger.info("Dimension des embeddings %s -> %s : index vidé.", dim_actuelle, dim)
            await conn.execute(text("DROP INDEX IF EXISTS idx_chunk_embedding"))
            await conn.execute(text("DROP INDEX IF EXISTS idx_chunk_embedding_hnsw"))
            await conn.execute(text("DELETE FROM document_chunk"))
            await conn.execute(text("ALTER TABLE document_chunk DROP COLUMN IF EXISTS embedding"))
            await conn.execute(text(f"ALTER TABLE document_chunk ADD COLUMN embedding vector({dim})"))

        await conn.execute(text("DROP INDEX IF EXISTS idx_chunk_embedding"))  # ancien IVFFlat
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunk_embedding_hnsw
            ON document_chunk USING hnsw (embedding vector_cosine_ops)
        """))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunk_source
            ON document_chunk (projet_id, source_type, source_id)
        """))

    _pgvector_ok = True
    return True


# ============================================================
# Modèle d'embeddings
# ============================================================

def _charger_modele_sync():
    # Sous Windows, Python n'utilise pas le magasin de certificats du système :
    # le premier téléchargement du modèle échoue (CERTIFICATE_VERIFY_FAILED).
    # truststore corrige cela sans désactiver la vérification TLS.
    try:
        import truststore
        truststore.inject_into_ssl()
    except ImportError:
        pass
    from fastembed import TextEmbedding
    # D'abord le cache local : sans cela, chaque démarrage interroge Hugging
    # Face (lent, et impossible hors ligne). Téléchargement seulement s'il manque.
    try:
        return TextEmbedding(settings.EMBEDDING_MODEL, cache_dir=settings.EMBEDDING_CACHE_DIR,
                             local_files_only=True)
    except Exception:  # noqa: BLE001 — modèle absent du cache
        return TextEmbedding(settings.EMBEDDING_MODEL, cache_dir=settings.EMBEDDING_CACHE_DIR)


async def _obtenir_modele():
    """Charge le modèle une seule fois (premier appel : téléchargement ~500 Mo)."""
    global _modele, _modele_en_echec
    if _modele is not None:
        return _modele
    async with _verrou_modele:
        if _modele is None and not _modele_en_echec:
            try:
                _modele = await run_in_threadpool(_charger_modele_sync)
                logger.info("Modèle d'embeddings chargé : %s", settings.EMBEDDING_MODEL)
            except Exception as exc:  # noqa: BLE001
                _modele_en_echec = True
                logger.error("Modèle d'embeddings indisponible (%s) : plein texte uniquement.", exc)
    return _modele


async def precharger_modele() -> None:
    """Charge le modèle en arrière-plan au démarrage (évite d'attendre à la 1re recherche)."""
    if disponible():
        await _obtenir_modele()


async def encoder(textes: List[str]) -> Optional[List[List[float]]]:
    modele = await _obtenir_modele()
    if modele is None:
        return None
    vecteurs = await run_in_threadpool(lambda: list(modele.embed(textes, batch_size=32)))
    return [v.tolist() for v in vecteurs]


def _litteral(vecteur: List[float]) -> str:
    """Format texte accepté par pgvector : '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{x:.6f}" for x in vecteur) + "]"


# ============================================================
# Découpage
# ============================================================

def decouper(texte: str) -> List[str]:
    """Découpe un texte en passages qui se recouvrent, en coupant sur un blanc."""
    texte = " ".join((texte or "").split())
    if not texte:
        return []
    passages, debut = [], 0
    while debut < len(texte) and len(passages) < MAX_PASSAGES_PAR_SOURCE:
        fin = min(debut + TAILLE_PASSAGE, len(texte))
        if fin < len(texte):
            coupe = texte.rfind(" ", debut + TAILLE_PASSAGE // 2, fin)
            fin = coupe if coupe != -1 else fin
        passages.append(texte[debut:fin].strip())
        if fin >= len(texte):
            break
        # Le passage suivant reprend un peu avant `fin`, mais au début d'un mot
        reprise = texte.find(" ", fin - CHEVAUCHEMENT, fin)
        debut = reprise + 1 if reprise != -1 else fin
    return [p for p in passages if p]


# ============================================================
# Synchronisation de l'index d'un projet
# ============================================================

@dataclass
class _Source:
    type: str
    id: int
    titre: str
    empreinte: str
    texte: Optional[str] = None   # None pour un fichier : extrait seulement si besoin
    chemin: Optional[str] = None


def _hash(*parties) -> str:
    return hashlib.sha256("\x1f".join(str(p or "") for p in parties).encode()).hexdigest()


# ============================================================
# Texte décrivant une tâche / un jalon
# ============================================================
# Le titre seul ne suffit pas : une question comme « date d'échéance » ou
# « tâches en retard » porte sur les ATTRIBUTS (échéance, statut, responsable).
# Ce texte est utilisé à la fois par la recherche par mots-clés et par l'index
# sémantique ; le modifier change l'empreinte, donc ré-encode automatiquement.

LIBELLES_STATUT = {"a_faire": "À faire", "en_cours": "En cours", "en_revue": "En revue", "termine": "Terminé"}


def _valeur(v):
    return getattr(v, "value", v)


def _date_fr(d) -> str:
    return d.strftime("%d/%m/%Y") if d else ""


def texte_tache(t, responsable: Optional[str] = None) -> str:
    morceaux = [f"Tâche « {t.titre} ».", (t.description or "").strip()]
    statut = LIBELLES_STATUT.get(_valeur(t.statut), _valeur(t.statut))
    if statut:
        morceaux.append(f"Statut : {statut}.")
    if t.priorite:
        morceaux.append(f"Priorité : {_valeur(t.priorite)}.")
    if t.echeance:
        morceaux.append(f"Échéance (date limite) : {_date_fr(t.echeance)}.")
    if responsable:
        morceaux.append(f"Responsable : {responsable}.")
    return " ".join(m for m in morceaux if m)


def resume_tache(t, responsable: Optional[str] = None) -> str:
    """Ligne courte affichée sous un résultat de recherche."""
    parts = [LIBELLES_STATUT.get(_valeur(t.statut), "")]
    if t.echeance:
        parts.append(f"échéance le {_date_fr(t.echeance)}")
    if responsable:
        parts.append(responsable)
    texte = " · ".join(p for p in parts if p)
    return f"{texte} — {t.description}" if t.description else texte


def texte_jalon(j) -> str:
    morceaux = [f"Jalon « {j.titre} ».", (j.description or "").strip()]
    if j.echeance:
        morceaux.append(f"Échéance (date limite) : {_date_fr(j.echeance)}.")
    morceaux.append("Atteint." if j.atteint else "Non atteint.")
    return " ".join(m for m in morceaux if m)


def resume_jalon(j) -> str:
    parts = [f"échéance le {_date_fr(j.echeance)}" if j.echeance else "", "atteint" if j.atteint else "non atteint"]
    texte = " · ".join(p for p in parts if p)
    return f"{texte} — {j.description}" if j.description else texte


async def responsables_du_projet(db: AsyncSession, taches) -> dict:
    ids = {t.responsable_id for t in taches if t.responsable_id}
    if not ids:
        return {}
    rows = (await db.execute(select(Utilisateur).where(Utilisateur.id.in_(ids)))).scalars().all()
    return {u.id: f"{u.prenom} {u.nom}".strip() for u in rows}


async def _sources_du_projet(db: AsyncSession, projet_id: int) -> List[_Source]:
    sources: List[_Source] = []

    taches = (await db.execute(select(Tache).where(Tache.projet_id == projet_id))).scalars().all()
    titres_taches = {t.id: t.titre for t in taches}
    noms = await responsables_du_projet(db, taches)
    for t in taches:
        texte = texte_tache(t, noms.get(t.responsable_id))
        sources.append(_Source("tache", t.id, t.titre, _hash(texte), texte))

    commentaires = (await db.execute(
        select(CommentaireTache).join(Tache, Tache.id == CommentaireTache.tache_id)
        .where(Tache.projet_id == projet_id)
    )).scalars().all()
    for c in commentaires:
        titre = f"Commentaire sur « {titres_taches.get(c.tache_id, c.tache_id)} »"
        sources.append(_Source("commentaire", c.id, titre, _hash(c.contenu), c.contenu))

    jalons = (await db.execute(select(Jalon).where(Jalon.projet_id == projet_id))).scalars().all()
    for j in jalons:
        texte = texte_jalon(j)
        sources.append(_Source("jalon", j.id, j.titre, _hash(texte), texte))

    fichiers = (await db.execute(select(Fichier).where(Fichier.projet_id == projet_id))).scalars().all()
    for f in fichiers:
        # Empreinte sur les métadonnées : on évite de relire chaque PDF à chaque recherche.
        sources.append(_Source(
            "fichier", f.id, f.nom, _hash(f.nom, f.taille_octets, f.chemin_ou_url), chemin=f.chemin_ou_url,
        ))
    return sources


async def synchroniser_projet(db: AsyncSession, projet_id: int) -> int:
    """
    Met l'index du projet à jour. Retourne le nombre de passages (ré)encodés.
    Un verrou transactionnel évite que deux recherches simultanées indexent
    le même projet en double.
    """
    if not disponible():
        return 0

    await db.execute(text("SELECT pg_advisory_xact_lock(:cle)"), {"cle": 7_310_000 + projet_id})

    sources = await _sources_du_projet(db, projet_id)
    attendues = {(s.type, s.id): s for s in sources}

    lignes = (await db.execute(text("""
        SELECT DISTINCT source_type, source_id, empreinte
        FROM document_chunk WHERE projet_id = :p
    """), {"p": projet_id})).all()
    indexees = {(r.source_type, r.source_id): r.empreinte for r in lignes}

    # Sources supprimées, modifiées, ou lignes héritées sans type -> on retire
    a_retirer = [
        cle for cle, emp in indexees.items()
        if cle not in attendues or attendues[cle].empreinte != emp
    ]
    for type_, id_ in a_retirer:
        await db.execute(text("""
            DELETE FROM document_chunk
            WHERE projet_id = :p AND source_type IS NOT DISTINCT FROM :t
              AND source_id IS NOT DISTINCT FROM :i
        """), {"p": projet_id, "t": type_, "i": id_})

    a_indexer = [s for cle, s in attendues.items() if indexees.get(cle) != s.empreinte]
    lignes_a_inserer = []
    for s in a_indexer:
        texte = s.texte
        if s.type == "fichier":
            texte = await run_in_threadpool(extraire_texte_fichier_stocke, s.chemin)
            texte = f"{s.titre}. {texte or ''}"
        for passage in decouper(texte):
            lignes_a_inserer.append((s, passage))

    if lignes_a_inserer:
        vecteurs = await encoder([passage for _, passage in lignes_a_inserer])
        if vecteurs is None:
            await db.rollback()   # ne pas valider les suppressions sans les nouveaux vecteurs
            return 0
        await db.execute(
            text("""
                INSERT INTO document_chunk
                    (projet_id, source_type, source_id, source, contenu, empreinte, embedding)
                VALUES (:p, :t, :i, :titre, :contenu, :emp, CAST(:v AS vector))
            """),
            [
                {"p": projet_id, "t": s.type, "i": s.id, "titre": s.titre,
                 "contenu": passage, "emp": s.empreinte, "v": _litteral(v)}
                for (s, passage), v in zip(lignes_a_inserer, vecteurs)
            ],
        )
    await db.commit()
    return len(lignes_a_inserer)


# ============================================================
# Recherche
# ============================================================

async def passages_des_fichiers(db: AsyncSession, projet_id: int) -> dict:
    """
    Texte déjà extrait des fichiers du projet, {fichier_id: [passage, …]}.

    Sert à la recherche par mots-clés dans le CONTENU des documents, sans relire
    les PDF à chaque recherche. Vide si l'index (pgvector) n'est pas disponible.
    """
    if not disponible():
        return {}
    await synchroniser_projet(db, projet_id)
    lignes = (await db.execute(text("""
        SELECT source_id, contenu FROM document_chunk
        WHERE projet_id = :p AND source_type = 'fichier'
        ORDER BY id
    """), {"p": projet_id})).all()
    passages: dict = {}
    for r in lignes:
        passages.setdefault(r.source_id, []).append(r.contenu)
    return passages


async def rechercher_semantique(db: AsyncSession, projet_id: int, requete: str,
                                limite: int = 10, seuil_min: float = 0.0) -> List[dict]:
    """
    Passages du projet les plus proches du sens de la requête, un seul résultat
    par source (le meilleur passage), filtrés par EMBEDDING_SEUIL et
    EMBEDDING_SEUIL_RELATIF.
    """
    if not disponible() or not requete.strip():
        return []
    await synchroniser_projet(db, projet_id)
    vecteurs = await encoder([requete.strip()])
    if not vecteurs:
        return []

    lignes = (await db.execute(text("""
        SELECT source_type, source_id, source, contenu,
               1 - (embedding <=> CAST(:q AS vector)) AS score
        FROM document_chunk
        WHERE projet_id = :p AND source_type IS NOT NULL
        ORDER BY embedding <=> CAST(:q AS vector)
        LIMIT :k
    """), {"q": _litteral(vecteurs[0]), "p": projet_id, "k": limite * 4})).all()

    meilleur = float(lignes[0].score) if lignes else 0.0
    seuil = max(settings.EMBEDDING_SEUIL, meilleur * settings.EMBEDDING_SEUIL_RELATIF, seuil_min)
    resultats, vus = [], set()
    for r in lignes:
        cle = (r.source_type, r.source_id)
        if cle in vus or r.score < seuil:
            continue
        vus.add(cle)
        extrait = r.contenu if len(r.contenu) <= 300 else r.contenu[:297] + "…"
        resultats.append({
            "type": r.source_type, "id": r.source_id, "titre": r.source,
            "extrait": extrait, "projet_id": projet_id, "score": round(float(r.score), 3),
        })
        if len(resultats) >= limite:
            break
    return resultats

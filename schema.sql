-- ============================================================
--  KANTO — Schéma de base de données (PostgreSQL + pgvector)
--  Plateforme de gestion de projets assistée par l'IA
--  Réf. : Cahier des charges Kanto — entités section "Modèle de données"
-- ============================================================
--  Ordre de création respecté (parents avant enfants).
--  À exécuter sur une base vide :  psql -d kanto -f schema.sql
-- ============================================================

-- Extension pour la recherche vectorielle (RF-31, priorité "Could" — optionnel).
-- Nécessite pgvector installé sur le serveur (voir NOTES_PGVECTOR en bas de fichier).
-- Décommente cette ligne UNIQUEMENT si pgvector est installé :
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
--  TYPES ÉNUMÉRÉS
-- ------------------------------------------------------------
CREATE TYPE role_utilisateur   AS ENUM ('admin', 'direction', 'equipe', 'client');
CREATE TYPE statut_sante       AS ENUM ('vert', 'orange', 'rouge');
CREATE TYPE statut_tache       AS ENUM ('a_faire', 'en_cours', 'en_revue', 'termine');
CREATE TYPE priorite_tache     AS ENUM ('basse', 'moyenne', 'haute');
CREATE TYPE type_analyse_ia    AS ENUM ('analyse_cdc', 'extraction', 'resume', 'detection', 'statut', 'affectation', 'recherche');
CREATE TYPE statut_suggestion  AS ENUM ('en_attente', 'validee', 'rejetee');

-- ============================================================
--  1. CLIENT  (l'entreprise / personne cliente — entité métier)
-- ============================================================
CREATE TABLE client (
    id          BIGSERIAL PRIMARY KEY,
    nom         VARCHAR(150) NOT NULL,
    contact     VARCHAR(150),
    email       VARCHAR(150),
    telephone   VARCHAR(30),
    cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  2. UTILISATEUR  (comptes qui se connectent — RF-01, RF-02)
-- ============================================================
CREATE TABLE utilisateur (
    id                  BIGSERIAL PRIMARY KEY,
    nom                 VARCHAR(100) NOT NULL,
    prenom              VARCHAR(100) NOT NULL,
    email               VARCHAR(150) NOT NULL UNIQUE,        -- identifiant de connexion
    mot_de_passe_hash   VARCHAR(255) NOT NULL,               -- jamais en clair (RNF-02)
    role                role_utilisateur NOT NULL,
    -- rempli UNIQUEMENT si role = 'client' (cloisonnement RF-03)
    client_id           BIGINT REFERENCES client(id) ON DELETE SET NULL,
    -- métier du membre (développeur, graphiste, intégrateur…)
    metier              VARCHAR(100),
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- un compte "client" DOIT être rattaché à un client ; les autres non
    CONSTRAINT chk_client_lien
        CHECK ( (role = 'client' AND client_id IS NOT NULL)
             OR (role <> 'client' AND client_id IS NULL) )
);

-- ============================================================
--  3. PROJET  (objet central — RF-05 à RF-10)
-- ============================================================
CREATE TABLE projet (
    id                  BIGSERIAL PRIMARY KEY,
    nom                 VARCHAR(200) NOT NULL,
    description         TEXT,
    client_id           BIGINT NOT NULL REFERENCES client(id) ON DELETE RESTRICT,     -- RF-06
    responsable_id      BIGINT REFERENCES utilisateur(id) ON DELETE SET NULL,         -- chef de projet
    date_debut          DATE,
    date_fin_prevue     DATE,
    statut_sante        statut_sante NOT NULL DEFAULT 'vert',                          -- RF-10
    avancement_pct      SMALLINT NOT NULL DEFAULT 0 CHECK (avancement_pct BETWEEN 0 AND 100), -- RF-09 (calculé)
    archive             BOOLEAN NOT NULL DEFAULT FALSE,                                -- RF-05
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  4. PROJET_MEMBRE  (équipe affectée — N↔N — RF-06, RF-13)
-- ============================================================
CREATE TABLE projet_membre (
    projet_id           BIGINT NOT NULL REFERENCES projet(id) ON DELETE CASCADE,
    utilisateur_id      BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    role_dans_projet    VARCHAR(60),          -- ex. developpeur, integrateur, designer
    PRIMARY KEY (projet_id, utilisateur_id)
);

-- ============================================================
--  5. TACHE  (RF-11 à RF-15)
-- ============================================================
CREATE TABLE tache (
    id                  BIGSERIAL PRIMARY KEY,
    projet_id           BIGINT NOT NULL REFERENCES projet(id) ON DELETE CASCADE,
    titre               VARCHAR(200) NOT NULL,
    description         TEXT,
    statut              statut_tache NOT NULL DEFAULT 'a_faire',    -- colonnes Kanban (RF-12)
    priorite            priorite_tache NOT NULL DEFAULT 'moyenne',
    echeance            DATE,
    responsable_id      BIGINT REFERENCES utilisateur(id) ON DELETE SET NULL,   -- RF-13
    ordre               INTEGER NOT NULL DEFAULT 0,                 -- position dans la colonne Kanban
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    modifie_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  6. COMMENTAIRE_TACHE  (RF-14)
-- ============================================================
CREATE TABLE commentaire_tache (
    id                  BIGSERIAL PRIMARY KEY,
    tache_id            BIGINT NOT NULL REFERENCES tache(id) ON DELETE CASCADE,
    utilisateur_id      BIGINT REFERENCES utilisateur(id) ON DELETE SET NULL,
    contenu             TEXT NOT NULL,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  7. JALON  (milestones — RF-07)
-- ============================================================
CREATE TABLE jalon (
    id                  BIGSERIAL PRIMARY KEY,
    projet_id           BIGINT NOT NULL REFERENCES projet(id) ON DELETE CASCADE,
    titre               VARCHAR(200) NOT NULL,
    echeance            DATE,
    atteint             BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
--  8. FICHIER  (documents joints, dont le CDC — RF-08)
-- ============================================================
CREATE TABLE fichier (
    id                  BIGSERIAL PRIMARY KEY,
    projet_id           BIGINT NOT NULL REFERENCES projet(id) ON DELETE CASCADE,
    nom                 VARCHAR(255) NOT NULL,
    chemin_ou_url       TEXT NOT NULL,
    type_mime           VARCHAR(100),
    taille_octets       BIGINT,
    televerse_par       BIGINT REFERENCES utilisateur(id) ON DELETE SET NULL,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  9. SAISIE_TEMPS  (suivi allégé — RF-23, RF-24)
-- ============================================================
CREATE TABLE saisie_temps (
    id                  BIGSERIAL PRIMARY KEY,
    tache_id            BIGINT NOT NULL REFERENCES tache(id) ON DELETE CASCADE,
    utilisateur_id      BIGINT NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
    duree_min           INTEGER NOT NULL CHECK (duree_min > 0),
    date_saisie         DATE NOT NULL DEFAULT CURRENT_DATE,
    note                TEXT
);

-- ============================================================
--  10. ANALYSE_IA  (trace de chaque traitement IA — RNF-03)
-- ============================================================
CREATE TABLE analyse_ia (
    id                  BIGSERIAL PRIMARY KEY,
    projet_id           BIGINT REFERENCES projet(id) ON DELETE CASCADE,
    type                type_analyse_ia NOT NULL,
    source              TEXT,                    -- fichier / message d'origine
    entree              TEXT,                    -- ce qui a été envoyé (strict nécessaire)
    resultat_json       JSONB,                   -- sortie brute de l'IA
    modele              VARCHAR(80),             -- modèle utilisé (journalisation)
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  11. SUGGESTION_TACHE  ("l'IA propose, l'humain valide" — RF-15, RF-26)
-- ============================================================
CREATE TABLE suggestion_tache (
    id                  BIGSERIAL PRIMARY KEY,
    analyse_ia_id       BIGINT REFERENCES analyse_ia(id) ON DELETE SET NULL,
    projet_id           BIGINT NOT NULL REFERENCES projet(id) ON DELETE CASCADE,
    titre               VARCHAR(200) NOT NULL,
    description         TEXT,
    priorite            priorite_tache NOT NULL DEFAULT 'moyenne',
    echeance            DATE,
    statut              statut_suggestion NOT NULL DEFAULT 'en_attente',
    -- rempli SI validée : devient une vraie tâche
    tache_id            BIGINT REFERENCES tache(id) ON DELETE SET NULL,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
--  12. DOCUMENT_CHUNK  (recherche vectorielle — pgvector — RF-31)
--  dimension 1536 = embeddings OpenAI text-embedding-3-small
--  >>> OPTIONNEL : décommente ce bloc SEULEMENT si pgvector est installé.
-- ============================================================
-- CREATE TABLE document_chunk (
--     id                  BIGSERIAL PRIMARY KEY,
--     projet_id           BIGINT REFERENCES projet(id) ON DELETE CASCADE,
--     source              TEXT,                    -- fichier / message d'origine
--     contenu             TEXT NOT NULL,
--     embedding           vector(1536)
-- );

-- ============================================================
--  INDEX  (accès fréquents + recherche vectorielle)
-- ============================================================
CREATE INDEX idx_utilisateur_email      ON utilisateur (email);
CREATE INDEX idx_projet_client          ON projet (client_id);
CREATE INDEX idx_projet_responsable     ON projet (responsable_id);
CREATE INDEX idx_tache_projet           ON tache (projet_id);
CREATE INDEX idx_tache_responsable      ON tache (responsable_id);
CREATE INDEX idx_tache_statut           ON tache (projet_id, statut);
CREATE INDEX idx_commentaire_tache      ON commentaire_tache (tache_id);
CREATE INDEX idx_jalon_projet           ON jalon (projet_id);
CREATE INDEX idx_fichier_projet         ON fichier (projet_id);
CREATE INDEX idx_temps_tache            ON saisie_temps (tache_id);
CREATE INDEX idx_temps_utilisateur      ON saisie_temps (utilisateur_id);
CREATE INDEX idx_analyse_projet         ON analyse_ia (projet_id);
CREATE INDEX idx_suggestion_projet      ON suggestion_tache (projet_id, statut);

-- Index vectoriel (similarité cosinus) — OPTIONNEL, décommente avec la table document_chunk :
-- CREATE INDEX idx_chunk_embedding
--     ON document_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
--  FIN DU SCHÉMA
-- ============================================================

-- ============================================================
--  NOTES_PGVECTOR — installer pgvector plus tard (Windows / PostgreSQL 13)
-- ============================================================
--  pgvector n'est PAS fourni avec PostgreSQL : il faut l'installer sur le serveur.
--
--  OPTION 1 (recommandée à terme) — Docker, propre et sans compilation :
--     docker run -d --name kanto-db -e POSTGRES_PASSWORD=pass \
--       -p 5432:5432 pgvector/pgvector:pg16
--     (l'extension y est déjà présente ; il reste juste "CREATE EXTENSION vector;")
--
--  OPTION 2 — Compiler pour ton PostgreSQL 13 existant :
--     - Installer "Visual Studio Build Tools" (charge de travail : Développement C++).
--     - Ouvrir "x64 Native Tools Command Prompt for VS", puis :
--         set "PGROOT=C:\Program Files\PostgreSQL\13"
--         git clone --branch v0.7.4 https://github.com/pgvector/pgvector.git
--         cd pgvector
--         nmake /F Makefile.win
--         nmake /F Makefile.win install       (à lancer en admin)
--     - Cela copie vector.control et vector.dll dans le dossier PostgreSQL.
--     - Ensuite dans pgAdmin/psql :  CREATE EXTENSION vector;
--
--  Après installation : décommente les blocs "vector" ci-dessus et ré-exécute-les.
-- ============================================================

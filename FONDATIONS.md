# Kanto — Fondations techniques

> Base de travail pour démarrer le développement. Ne contient **aucun code** :
> uniquement les structures, modèles et cartographies à coder toi-même.
> Source : *Cahier des charges — Kanto (plateforme de gestion de projets assistée par l'IA)*.

---

## 1. Stack & principes

| Couche          | Techno                     | Rôle |
|-----------------|----------------------------|------|
| Frontend        | React (composants)         | Dashboard, Projets, Tâches, Espace client, Assistant IA |
| Backend         | FastAPI (Python), MVC      | API REST + logique métier + service IA isolé |
| Base de données | PostgreSQL + **pgvector**  | Données relationnelles + recherche par embeddings |
| IA              | API OpenAI                 | Encapsulée dans **un seul service** remplaçable |
| Interconnexions | e-resaka · B-estimation    | Deep-link (pas de redéveloppement) |

**3 règles à ne jamais casser :**
1. **« L'IA propose, l'humain valide »** — aucune sortie IA n'agit automatiquement (RF-25 à RF-31).
2. **Dégradation gracieuse** — la plateforme reste utilisable si l'IA est indisponible (RNF-05).
3. **Cloisonnement client strict** — un client ne voit QUE son projet (RF-03, RF-22).

---

## 2. Architecture en 3 couches

```
[ React (SPA) ]  --REST/JSON + WebSocket-->  [ FastAPI ]  -->  [ PostgreSQL + pgvector ]
                                                  |
                                                  +--> Service IA (isolé) --> API OpenAI
                                                  |
                                                  +--> Connecteurs --> e-resaka / B-estimation (deep-link)
```

- Le **service IA** est un module à part : le reste du backend l'appelle via une interface. On peut le débrancher ou remplacer OpenAI sans toucher au métier.
- Les **connecteurs** ne font (pour le prototype) que construire des URL contextualisées vers les apps existantes.

---

## 3. Arborescence des dossiers

### Backend — `backend/`
```
backend/
├── app/
│   ├── main.py                # point d'entrée FastAPI
│   ├── core/                  # config, sécurité (JWT), dépendances communes
│   │   ├── config.py
│   │   ├── security.py        # hachage mdp, création/vérif JWT
│   │   └── database.py        # connexion PostgreSQL
│   ├── models/                # tables (ORM) — cf. section 4
│   ├── schemas/               # objets d'entrée/sortie API (validation)
│   ├── routers/               # les routes REST, un fichier par module (cf. section 6)
│   │   ├── auth.py
│   │   ├── projets.py
│   │   ├── taches.py
│   │   ├── dashboard.py
│   │   ├── client.py
│   │   ├── temps.py
│   │   ├── ia.py
│   │   └── connecteurs.py
│   ├── services/              # logique métier
│   │   ├── ia/                # SERVICE IA ISOLÉ
│   │   │   ├── client_openai.py
│   │   │   ├── analyse_cdc.py
│   │   │   ├── extraction_taches.py
│   │   │   ├── resume.py
│   │   │   ├── detection.py
│   │   │   └── recherche.py   # SQL/vecteurs puis IA
│   │   └── connecteurs.py     # URL e-resaka / B-estimation
│   ├── repositories/          # accès données (requêtes)
│   └── permissions.py         # matrice des rôles (cf. section 5)
├── migrations/                # évolution du schéma BD
├── tests/
└── requirements.txt
```

### Frontend — `frontend/`
```
frontend/
├── src/
│   ├── api/                   # appels REST (un fichier par module)
│   ├── auth/                  # login, stockage token, contexte utilisateur
│   ├── components/            # composants réutilisables (boutons, cartes, badges statut)
│   ├── pages/
│   │   ├── Dashboard/
│   │   ├── Projets/
│   │   ├── ProjetDetail/      # onglets : Tâches (Kanban), Fichiers, Jalons, IA
│   │   ├── Taches/            # tableau Kanban (glisser-déposer)
│   │   ├── EspaceClient/
│   │   └── AssistantIA/
│   ├── routes/                # routage + gardes selon le rôle
│   └── App.jsx
└── package.json
```

---

## 4. Modèle de données (tables)

> Noms de tables/colonnes indicatifs. Le détail final (types exacts, cardinalités)
> se formalise dans ton **diagramme de classes UML** (demandé par le CDC).

### `utilisateur`  — comptes qui se connectent
| Colonne | Type | Notes |
|---|---|---|
| id | PK | |
| nom, prenom | texte | |
| email | texte unique | identifiant de connexion |
| mot_de_passe_hash | texte | **jamais** en clair (RNF-02) |
| role | enum | `direction` \| `equipe` \| `client` |
| client_id | FK → client | rempli **uniquement** si role = client |
| actif | booléen | |
| cree_le | date/heure | |

### `client`  — l'entreprise/personne cliente (entité métier)
| id (PK) · nom · contact · email · telephone · cree_le |
> Relation : **1 client → N projets**.

### `projet`  — objet central
| Colonne | Type | Notes |
|---|---|---|
| id | PK | |
| nom, description | texte | |
| client_id | FK → client | RF-06 |
| responsable_id | FK → utilisateur | chef de projet |
| date_debut, date_fin_prevue | date | |
| statut_sante | enum | `vert` \| `orange` \| `rouge` (RF-10) |
| avancement_pct | entier 0-100 | **calculé** depuis les tâches (RF-09) |
| archive | booléen | RF-05 |
| cree_le | date/heure | |

### `projet_membre`  — équipe affectée (N↔N)
| projet_id (FK) · utilisateur_id (FK) · role_dans_projet | → RF-06, RF-13 |

### `tache`
| Colonne | Type | Notes |
|---|---|---|
| id | PK | |
| projet_id | FK → projet | |
| titre, description | texte | |
| statut | enum | colonnes Kanban : `a_faire` \| `en_cours` \| `en_revue` \| `termine` (RF-12) |
| priorite | enum | `basse` \| `moyenne` \| `haute` |
| echeance | date | |
| responsable_id | FK → utilisateur | RF-13 |
| ordre | entier | position dans la colonne Kanban |
| cree_le | date/heure | |

### `commentaire_tache`
| id · tache_id (FK) · utilisateur_id (FK) · contenu · cree_le | → RF-14 |

### `jalon`
| id · projet_id (FK) · titre · echeance · atteint (booléen) | → RF-07 |

### `fichier`
| id · projet_id (FK) · nom · chemin_ou_url · type · taille · televerse_par (FK) · cree_le | → RF-08 |

### `saisie_temps`
| id · tache_id (FK) · utilisateur_id (FK) · duree_min · date · note | → RF-23, RF-24 |

### `analyse_ia`  — trace de chaque traitement IA
| Colonne | Notes |
|---|---|
| id (PK) | |
| projet_id (FK) | |
| type | `analyse_cdc` \| `extraction` \| `resume` \| `detection` \| `statut` |
| source | fichier / message d'origine |
| entree | ce qui a été envoyé (limité au nécessaire — RNF-03) |
| resultat_json | sortie brute |
| modele | modèle IA utilisé (journalisation — RNF-03) |
| cree_le | |

### `suggestion_tache`  — le cœur de « l'IA propose »
| Colonne | Notes |
|---|---|
| id (PK) | |
| analyse_ia_id (FK) | d'où vient la suggestion |
| projet_id (FK) | |
| titre, description, priorite, echeance | contenu proposé |
| statut | `en_attente` \| `validee` \| `rejetee` |
| tache_id | FK → tache, rempli **si validée** (RF-15, RF-26) |

### `document_chunk`  — pour la recherche vectorielle (pgvector)
| id · projet_id (FK) · source · contenu (texte) · embedding (vector) | → RF-31 |

---

## 5. Matrice des rôles (à implémenter dans `permissions.py`)

| Action / Rôle                         | Direction | Chef de projet | Équipe (dev/design) | Client |
|---------------------------------------|:---------:|:--------------:|:-------------------:|:------:|
| Voir tous les projets                 | ✅ | ✅ | — | — |
| Voir ses projets affectés             | ✅ | ✅ | ✅ | son seul projet |
| Créer / modifier / archiver projet    | ✅ | ✅ | — | — |
| Gérer membres & affectations          | ✅ | ✅ | — | — |
| Créer / gérer tâches                  | ✅ | ✅ | — | — |
| Faire avancer ses tâches assignées    | ✅ | ✅ | ✅ | — |
| Saisir son temps                      | ✅ | ✅ | ✅ | — |
| Piloter l'IA                          | ✅ | ✅ | — | — |
| **Volet financier** (devis, CA, factures, bouton *Estimation*) | ✅ | ❌ | ❌ | ses devis (lecture) |
| Chat du projet (e-resaka)             | ✅ | ✅ | ✅ | son projet |

> **Point clé** : le Chef de projet gère tout **sauf l'argent**. Le bouton « Estimation »
> ne lui est même pas affiché. Le Client est **cloisonné** à un seul projet.

---

## 6. Cartographie des endpoints API (REST)

> À exposer sous `/api`, documentés automatiquement (OpenAPI/Swagger — RNF-07).
> Chaque route vérifie le rôle (section 5).

**Auth** (RF-01 → RF-04)
- `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/reset-password`

**Projets** (RF-05 → RF-10)
- `GET /projets` · `POST /projets` · `GET /projets/{id}` · `PUT /projets/{id}` · `POST /projets/{id}/archiver`
- `GET /projets/{id}/membres` · `POST /projets/{id}/membres`
- `GET /projets/{id}/jalons` · `POST /projets/{id}/jalons`
- `GET /projets/{id}/fichiers` · `POST /projets/{id}/fichiers`
- `GET /projets/{id}/avancement` (pourcentage calculé)

**Tâches** (RF-11 → RF-15)
- `GET /projets/{id}/taches` · `POST /projets/{id}/taches`
- `PUT /taches/{id}` · `PATCH /taches/{id}/statut` (déplacement Kanban) · `PATCH /taches/{id}/affectation`
- `GET /taches/{id}/commentaires` · `POST /taches/{id}/commentaires`

**Dashboard** (RF-16 → RF-18)
- `GET /dashboard/projets` (vue globale + santé) · `GET /dashboard/indicateurs` · `GET /dashboard/alertes`

**Espace client** (RF-19 → RF-22)
- `GET /client/mon-projet` (renvoie uniquement le projet du client connecté)

**Suivi du temps** (RF-23, RF-24)
- `POST /taches/{id}/temps` · `GET /projets/{id}/temps` · `GET /membres/{id}/temps`

**Service IA** (RF-25 → RF-31) — *asynchrone, avec indicateur de progression (RNF-01)*
- `POST /ia/analyse-cdc` (fichier → objectifs/contraintes/tâches initiales)
- `POST /ia/extraction-taches` → crée des `suggestion_tache` en `en_attente`
- `GET /projets/{id}/suggestions` · `POST /suggestions/{id}/valider` (→ crée la Tâche) · `POST /suggestions/{id}/rejeter`
- `POST /ia/resume` · `POST /ia/detection` · `POST /ia/statut-propose` · `POST /ia/recherche`

**Connecteurs** (RF-32 → RF-36)
- `GET /projets/{id}/lien-chat` → URL e-resaka contextualisée
- `GET /projets/{id}/lien-estimation` → URL B-estimation contextualisée

---

## 7. Le module IA (à isoler absolument)

Pour chaque fonction : **entrée → sortie**, et toujours une trace dans `analyse_ia`.

| RF | Fonction | Entrée | Sortie |
|----|----------|--------|--------|
| RF-25 | Analyse du cahier des charges | PDF/texte | objectifs, contraintes, livrables, deadlines, tâches initiales |
| RF-26 | Extraction des tâches | CDC + messages | `suggestion_tache` (à valider) |
| RF-27 | Résumé des échanges | nouveaux messages | résumé court |
| RF-28 | Détection deadlines/blocages | tâches + échanges | alertes |
| RF-29 | Proposition de statut | avancement + retards | vert/orange/rouge suggéré |
| RF-30 | Aide à l'affectation | tâches + charge | responsable suggéré |
| RF-31 | Recherche intelligente | requête | **d'abord SQL/pgvector, puis IA si besoin** |

> Toute sortie = **suggestion**. Rien n'est appliqué sans un clic humain de validation.

---

## 8. Besoins non fonctionnels à garder en tête (RNF)

- **Perf** : écrans < 2 s ; traitements IA **asynchrones** avec barre de progression.
- **Sécurité** : mdp hachés, HTTPS, cloisonnement client, **JWT**.
- **Confidentialité IA** : envoyer le strict minimum, journaliser les appels.
- **Ergonomie** : responsive (bureau + mobile), accessibilité clavier.
- **Fiabilité** : fonctionne même IA HS.
- **Maintenabilité** : modulaire, service IA remplaçable.
- **Évolutivité** : prévoir l'ajout des modules reportés.

---

## 9. Ordre de construction conseillé (Agile, par phases)

1. **Socle** : projet FastAPI + connexion PostgreSQL + React vide + Auth/JWT + rôles (RF-01→04).
2. **Projets & membres** : CRUD projet, affectation équipe, fichiers (RF-05→08).
3. **Tâches & Kanban** : CRUD tâches, glisser-déposer, calcul avancement (RF-09, RF-11→14).
4. **Dashboard** : vue globale + santé + indicateurs (RF-16→17).
5. **Espace client** : vue cloisonnée d'un seul projet (RF-19, RF-22).
6. **Service IA** : d'abord `analyse-cdc` + `extraction` + validation des suggestions (RF-25, RF-26, RF-15).
7. **IA avancée** : résumé, détection, statut proposé, alertes dashboard (RF-27→29, RF-18).
8. **Connecteurs** : boutons Chat / Estimation en deep-link niveau 2 (RF-32→35).
9. **Finitions** : suivi du temps, recherche vectorielle, SSO (RF-23,24,31,36).

> Chaque phase = livrable démontrable à la direction (méthode Agile).

---

## 10. À confirmer avant de coder (dépendances externes)

- **e-resaka** et **B-estimation** exposent-ils une **URL paramétrable** (ou une API) ?
  Sans ça, l'interconnexion reste au **niveau 1** (simple ouverture d'onglet).
- Le résumé des échanges (RF-27) suppose un ajout **côté e-resaka**.
- SSO (RF-36) : besoin d'un mécanisme d'authentification partagée entre les 3 apps.

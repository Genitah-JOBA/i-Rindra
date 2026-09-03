# i-Rindra — Plateforme de gestion de projets assistée par l'IA

Application web de gestion de projets pour agence : suivi des projets et des tâches (Kanban),
gestion des membres et des clients, espace client cloisonné, notifications, et un
assistant IA. Le tout avec une authentification par rôles.

##  Fonctionnalités

| Module | Détail |
|---|---|
| **Authentification** | Connexion JWT, 4 rôles : `admin`, `direction`, `equipe`, `client` |
| **Projets** | Créer / modifier / supprimer / archiver, avancement calculé, statut de santé (vert/orange/rouge) |
| **Membres** | Annuaire de l'équipe (direction + équipe) avec leur **métier**, CRUD |
| **Clients** | Entreprises clientes + leur **accès** de connexion à l'espace client |
| **Tâches** | Tableau **Kanban** (À faire / En cours / En revue / Terminé), affectation, priorité, échéance |
| **Jalons & Fichiers** | Jalons d'un projet, pièces jointes |
| **Tableau de bord** | Vue globale, indicateurs, alertes |
| **Espace client** | Le client ne voit **que son** projet (cloisonnement) |
| **Notifications** | Nouveau projet, affectation d'un membre, avancement d'une tâche |

### Rôles
- **admin** : accès complet, **y compris le volet financier** (devis, CA, factures).
- **direction** : mêmes droits que l'admin **sauf l'argent** (pas de finance).
- **equipe** : membre affecté aux projets (dev, graphiste…) avec son **métier**.
- **client** : entreprise cliente, accès à **son seul** projet.

### Règles métier clés
- Le **responsable** d'un projet est un membre du pilotage (**admin** ou **direction**).
- Un **compte client** est toujours rattaché à une **entreprise cliente** (`client_id`).
- Un client est **cloisonné** : il n'accède qu'à son propre projet.

---

## 🧱 Stack technique

- **Backend** : Python · **FastAPI** · SQLAlchemy (async) · Pydantic · JWT
- **Base de données** : **PostgreSQL** (via `asyncpg`)
- **Frontend** : **React 19** · Vite · Tailwind CSS · React Router · axios
- **IA** : API OpenAI

---

## 📁 Structure du projet

```
Gestion_Projet/
├── backend/
│   └── app/
│       ├── main.py            # point d'entrée FastAPI + CORS
│       ├── core/              # config, database (async), security (JWT/bcrypt)
│       ├── models/            # tables SQLAlchemy
│       ├── schemas/           # validation Pydantic
│       ├── routers/           # auth, projets, taches, membres(utilisateurs),
│       │                      # clients, client (espace client), dashboard,
│       │                      # fichiers, notifications
│       └── services/          # logique métier (notifications…)
├── frontend/
│   └── src/
│       ├── api/               # appels REST (un fichier par module)
│       ├── auth/              # contexte + service d'authentification
│       ├── components/        # Layout, NotificationBell…
│       └── pages/             # Login, Dashboard, Projets, ProjetDetail,
│                              # Taches, Membres, Clients, MonProjet
├── schema.sql                 # schéma PostgreSQL (dev, avec pgvector)
├── schema_o2switch.sql        # schéma PostgreSQL pour l'hébergement (sans pgvector)
└── FONDATIONS.md              # document de conception (modèle de données, rôles, API)
```

---

## 🚀 Installation & lancement (développement)

### 1. Base de données
Crée une base PostgreSQL (ex. `Gestion_Projet`) puis charge le schéma :

```bash
psql -U postgres -d Gestion_Projet -f schema.sql
```

> Au démarrage, le backend crée aussi les tables manquantes automatiquement (`create_all`).

### 2. Backend (FastAPI)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows  (source .venv/bin/activate sous Linux/Mac)
pip install -r requirements.txt
pip install asyncpg           # pilote async PostgreSQL (requis)
```

Crée un fichier `backend/.env` :
```bash
DATABASE_URL=postgresql://postgres:MON_MDP@localhost:5432/Gestion_Projet
SECRET_KEY=une_cle_secrete_longue_et_aleatoire
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
# OPENAI_API_KEY=sk-...   (pour le futur module IA)
```

Lance l'API :
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- Docs interactives : http://localhost:8000/docs

### 3. Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
- Application : http://localhost:5173 (le port peut varier ; le CORS accepte tout `localhost`)

Fichier `frontend/.env` :
```bash
VITE_API_URL=http://localhost:8000
```

---

##  Premier compte (admin)

Aucun compte n'existe au départ. Crée un compte **direction** :

- soit via `POST /auth/register` (dans `/docs` ou Postman) :
  ```json
  { "email": "admin@exemple.com", "mot_de_passe": "monmotdepasse", "nom": "Admin", "prenom": "Admin", "role": "direction" }
  ```
- soit en SQL (le mot de passe doit être un **hash bcrypt**).

Puis connecte-toi sur la page de login. Le rôle **direction** peut ensuite créer les membres, les clients et les projets.

> ⚠️ La connexion (`POST /auth/login`) utilise un **formulaire OAuth2** (`x-www-form-urlencoded`)
> avec les champs `username` (= email) et `password`, **pas** du JSON.

---

## 🌐 Déploiement (o2switch / hébergement mutualisé)

- Importer **`schema_o2switch.sql`** (sans `pgvector`) dans la base **PostgreSQL** via phpPgAdmin.
- Le backend Python nécessite l'étape **cPanel → « Setup Python App » (Passenger)** ; FastAPI (ASGI)
  se branche via un pont `passenger_wsgi.py` + `a2wsgi`.
- Le frontend se déploie en **statique** : `npm run build` → envoyer le contenu de `dist/`,
  avec `VITE_API_URL` pointant sur l'URL de l'API.

---

## 🗺️ Reste à faire

- **Module IA** (analyse du cahier des charges, extraction de tâches, résumés…) via OpenAI.
- **Interconnexions** e-resaka (chat) et B-estimation (devis) par deep-link.
- **Recherche intelligente** (pgvector ou recherche plein-texte selon l'hébergement).
- Réinitialisation du mot de passe, tests automatisés, migrations Alembic.

---

## 📄 Licence

Projet privé — usage interne.

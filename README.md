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
- **IA** : API LLM (Groq par défaut, **gratuit** — compatible OpenAI)

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
# IA — clé gratuite Groq : https://console.groq.com/keys
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...

# Réinitialisation de mot de passe (voir § « Mot de passe oublié » plus bas)
FRONTEND_URL=http://localhost:5173
RESET_TOKEN_EXPIRE_MINUTES=30
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

## 🔑 Mot de passe oublié

Le lien « Mot de passe oublié » de la page de connexion couvre trois étapes :
demande du lien par email, ouverture du lien, choix du nouveau mot de passe.

Le lien est **à usage unique** et valable `RESET_TOKEN_EXPIRE_MINUTES` (30 min
par défaut). Seul son condensat SHA-256 est stocké : une fuite de la table
`mot_de_passe_reinit` ne permet donc de réinitialiser le mot de passe de
personne. Les adresses sont normalisées en minuscules à toutes les entrées
(login, inscription, modification de profil, oubli), ce qui garantit qu'un
compte est retrouvable quelle que soit la casse saisie.

### En développement

Aucun email n'est envoyé : le backend renvoie le lien directement dans la
réponse (`RESET_LIEN_EN_REPONSE=true`) et l'affiche sur la page, en plus de
l'écrire dans les logs. Rien à configurer.

### En production

Il faut un serveur SMTP. Sur o2switch / cPanel, ce sont les serveurs mail de
l'hébergeur :

```bash
APP_ENV=production
SMTP_HOST=mail.i-rindra.bef4prod.com
SMTP_PORT=465
SMTP_USE_SSL=true          # port 587 -> laisser false et SMTP_STARTTLS=true
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_EXPEDITEUR=no-reply@i-rindra.bef4prod.com
FRONTEND_URL=https://app.i-rindra.bef4prod.com
```

`FRONTEND_URL` est indispensable : c'est lui qui construit le lien absolu
envoyé par email. En production, `RESET_LIEN_EN_REPONSE` est forcé à `false`
(le jeton ne doit jamais fuiter dans une réponse HTTP) et l'application
**refuse de démarrer** si `SMTP_HOST` est absent — mieux vaut un échec au
déploiement qu'une réinitialisation inopérante en production.

---

## 🌐 Déploiement (o2switch / hébergement mutualisé)

- Importer **`schema_o2switch.sql`** (sans `pgvector`) dans la base **PostgreSQL** via phpPgAdmin.
- Le backend Python nécessite l'étape **cPanel → « Setup Python App » (Passenger)** ; FastAPI (ASGI)
  se branche via un pont `passenger_wsgi.py` + `a2wsgi`.
- Le frontend se déploie en **statique** : `npm run build` → envoyer le contenu de `dist/`,
  avec `VITE_API_URL` pointant sur l'URL de l'API.
- Régler `APP_ENV=production` et les variables SMTP / `FRONTEND_URL` (voir § « Mot de passe oublié »).

---

## 🗺️ Reste à faire

- **Module IA** (analyse du cahier des charges, extraction de tâches, résumés…) via Groq (gratuit).
- **Interconnexions** e-resaka (chat) et B-estimation (devis) par deep-link.
- **Recherche intelligente** (pgvector ou recherche plein-texte selon l'hébergement).
- Tests automatisés, migrations Alembic.

---

## 📄 Licence

Projet privé — usage interne.

# Diagramme de flux — i-Rindra (Gestion de projets)

Diagrammes Mermaid des parcours de bout en bout de l'application.
Rendus nativement sur GitHub / GitLab ; ou sur https://mermaid.live (coller).

---

## 1. Vue d'ensemble (flux complet)

```mermaid
flowchart TD
    U[Utilisateur] -->|POST /auth/register| REG{Inscription publique}
    U -->|POST /auth/login| LOGIN[Authentification JWT]
    LOGIN --> V{Compte actif?}
    V -- non --> ERR1[403 Compte désactivé]
    V -- oui --> JWT[JWT: sub, role, client_id]

    JWT --> ROLE{Quel rôle?}

    subgraph ROLES[4 rôles]
        ADM[admin<br/>tout + finance]
        DIR[direction<br/>tout sauf argent]
        EQ[equipe<br/>projets & tâches affectés]
        CLI[client<br/>son seul projet]
    end

    ROLE -- admin --> ADM
    ROLE -- direction --> DIR
    ROLE -- equipe --> EQ
    ROLE -- client --> CLI

    %% Pilotage : gestion des projets
    DIR & ADM --> PROJ[Créer / modifier un projet<br/>POST /projets]
    PROJ -->|notification « projet_cree »| NDIR[Direction] & NCLI[Client du projet]
    DIR & ADM --> AJMEM[Ajouter un membre au projet]
    AJMEM -->|notification « membre_ajoute »| NMEM[Membre affecté]

    %% Tâches
    EQ & DIR & ADM --> TACHE[Créer / déplacer une tâche<br/>Kanban]
    TACHE --> AV[Recalcul avancement du projet<br/>update_projet_avancement]
    TACHE -->|notification « tache_avancement »| NTAV[Direction + client + membres<br/>sauf l'auteur]

    %% Deuxième niveau
    AV --> PJ[Projet : statut_sante, avancement_pct]
    PJ --> DASH[Dashboard: indicateurs & alertes]
    PJ --> ARCH[Archiver / désarchiver]

    %% Espace client
    CLI --> MONPROJ[GET /client/mon-projet<br/>projet du client uniquement]
    MONPROJ -->|cloisonnement: client_id| CLIENT_VU[Uniquement un projet: le sien]
    CLI --> ST[GET /client/mon-projet/statut]
    CLI --> AVNC[GET /client/mon-projet/avancement]
    CLI --> TCLI[GET /client/mon-projet/taches]

    %% Notifications
    NDIR & NCLI & NMEM & NTAV --> NOTIF[GET /notifications]
    NOTIF --> LU1[PATCH /notifications/:id/lue]
    NOTIF --> LU2[PATCH /notifications/toutes-lues]

    %% Facturation (admin seul)
    ADM -->|volet financier| FACT[Gérer factures<br/>POST /factures + statut]
    FACT --> FSTAT[GET /factures/statistiques]

    %% IA
    DIR & ADM --> IASTAT[GET /ia/status]
    DIR & ADM --> IAPING[POST /ia/ping]
    IAPING --> IAOK[Connecteur OpenAI]

    %% Gestion des comptes
    DIR & ADM --> MBRS[Gérer les membres<br/>/utilisateurs]
    DIR & ADM --> CLIENTCRUD[Gérer les clients<br/>/clients]
```

---

## 2. Authentification & rôles

```mermaid
sequenceDiagram
    actor P as Personne
    participant API as FastAPI
    participant DB as PostgreSQL
    participant JWT as JWT

    P->>API: POST /auth/register {email, mdp, role, client_id}
    alt rôle admin ou direction
        API-->>P: 403 escalade de privilèges interdite
    else rôle équipe
        API->>DB: hash bcrypt + insert
        API-->>P: 201 compte créé
    else rôle client
        API->>DB: client_id doit exister (sinon 400)
        API->>DB: hash bcrypt + insert (client_id renseigné)
        API-->>P: 201 compte créé
    end

    P->>API: POST /auth/login (OAuth2 form: username=email, password)
    API->>DB: vérifier email + bcrypt + actif
    DB-->>API: ok
    API-->>P: access_token (sub, role, client_id)
    P->>API: GET /auth/me (Bearer)
    API-->>P: profil connecté
```

---

## 3. Cycle de vie d'un projet

```mermaid
flowchart TD
    DIR[Direction / Admin] -->|POST /projets| C[Projet créé]
    C --> C1[statut_sante = VERT]
    C --> C2[avancement_pct = 0]
    C --> C3[dates début / fin prévue]
    C --> N1[Notifications: direction + client du projet]

    C --> M[Gérer les membres]
    M -->|POST /projets/:id/membres| MEM[Vérifs: existe, non déjà membre,<br/>pas un client, rôle par défaut « membre »]
    MEM --> N2[Notification « membre_ajoute » au membre]
    MEM --> R[Gérer le rôle dans le projet]

    C --> J[Gérer les jalons]
    J --> J1[POST jalon] --> J2[PATCH atteindre / réinitialiser]
    J2 --> JS[Statistiques: taux avancement, en retard]

    C --> F[Gérer les fichiers]
    F --> F1[Upload / renommer / télécharger / supprimer]

    C --> TR[Transfert de responsabilité<br/>POST /transferer-responsabilite]

    C --> T[Créer des tâches] --> AV[Avancement recalculé depuis les tâches]

    AV --> S{avancement / échéance}
    S --> SV[VERT] & SO[ORANGE] & SR[ROUGE] --> D2[Dashboard & alertes]

    D2 --> ARC[Archiver / désarchiver<br/>POST /projets/:id/archiver]
```

---

## 4. Tâches — Tableau Kanban

```mermaid
stateDiagram-v2
    [*] --> A_Faire : créer (POST /taches/projets/:id/taches)
    A_Faire --> En_Cours : affecter + déplacer
    En_Cours --> En_Revue : PATCH statut
    En_Revue --> Termine : valider
    A_Faire --> Termine : (possible en direct)
    En_Cours --> A_Faire : retour arrière
    En_Revue --> En_Cours : retour arrière
    Termine --> A_Faire : rouvrir

    note right of A_Faire
      À chaque changement de statut :
      - update_projet_avancement (RF-09)
      - notification « tache_avancement »
        (direction + client + membres, sauf l'auteur)
    end note
```

Détail des actions sur une tâche :

```mermaid
flowchart TD
    T[Tâche] --> PUT[PUT /taches/:id]
    T --> ST[PATCH /taches/:id/statut]
    T --> AF[PATCH /taches/:id/affectation]
    T --> DEL[DELETE /taches/:id]
    T --> CM[Commentaires: GET/POST]
    T --> TP[Saisie de temps: POST /taches/:id/temps]
    TP --> RPT[Stats temps par projet]
    ST --> AV[Avancement projet + notifications]
```

---

## 5. Espace client (cloisonnement)

```mermaid
flowchart TD
    CL[Client se connecte] --> JWT[Bearer + client_id du compte]
    JWT --> R{client_id match le projet ?}
    R -- non --> 403[403 accès refusé]
    R -- oui --> P[GET /client/mon-projet]
    P --> PT[GET /client/mon-projet/taches]
    P --> PS[GET /client/mon-projet/statut]
    P --> PA[GET /client/mon-projet/avancement]

    P --> NO[Le client voit uniquement SON projet:<br/>aucun listing global, aucune autre agence]
```

---

## 6. Notifications

```mermaid
flowchart LR
    EV[Événements] --> T1[projet_cree]
    EV --> T2[membre_ajoute]
    EV --> T3[tache_avancement]

    T1 --> D1[Idétermination des destinataires<br/>ids_direction + clients du projet]
    T2 --> D2[id du membre affecté]
    T3 --> D3[direction + membres du projet + client]

    D1 & D2 & D3 --> NOT[Table notifications<br/>1 ligne par destinataire]
    NOT --> UI[Validation non faite par le service:<br/>l'appelant fait le commit]

    UI --> R[GET /notifications]
    UI --> C[GET /notifications/count]
    UI --> L1[PATCH /notifications/:id/lue]
    UI --> L2[PATCH /notifications/toutes-lues]
```

---

## 7. Facturation (volet admin uniquement)

```mermaid
flowchart TD
    AD[admin] --> CRUD[CRUD factures: POST /factures, PUT, DELETE]
    AD --> STT[PATCH /factures/:id/statut]
    AD --> STAT[GET /factures/statistiques]
    AD --> LIST[GET /factures]

    DIRdirection[Direction] -.-> X[403 volet financier interdit]
```

---

## 8. Module IA

```mermaid
flowchart TD
    U[Utilisateur connecté] --> S[GET /ia/status]
    S --> R1[configuree: clé présente?<br/>modele configuré]

    AD[Admin / Direction] --> P[POST /ia/ping]
    P --> C[chat_completion via connecteur OpenAI]
    C --> K{OPENAI_API_KEY?}
    K -- non --> E1[503 LLMConfigError]
    K -- oui --> CL[client AsyncOpenAI en cache]
    CL --> OK[Appel gpt-4o-mini<br/>max_tokens=5]
    OK --> ERR{Erreur fournisseur?}
    ERR -- oui --> E2[LLMProviderError<br/>401/429/503/504/502]
    ERR -- non --> OK2[ia_ping: ok, reponse, modele]

    subgraph FUTUR[Fonctionnalités à venir]
        EXT[Extraction de tâches<br/>RF-26 analyse_cdc / extraction]
        RES[Résumé de projet<br/>RF-27 resume]
        DET[Détection d'alertes<br/>RF-28 detection]
        STT2[Statut proposé<br/>RF-29 statut]
        AFF[Affectation suggérée<br/>RF-30 affectation]
        RCH[Recherche vectorielle<br/>RF-31 recherche + pgvector]
    end
    CL -.-> FUTUR
    FUTUR --> TRACE[Journalisation analyse_ia<br/>Règle RNF-03]
```

---

## 9. Légende des rôles

| Rôle | Accès |
|---|---|
| **admin** | Tout, y compris le volet financier (factures) |
| **direction** | Tout sauf l'argent ; gère projets, membres, clients |
| **equipe** | Ses projets (responsable ou membre) + tâches affectées |
| **client** | Uniquement son projet (`/client/*`) |
# main.py

import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.routers import auth, projets, taches, dashboard, client, fichiers, utilisateurs, notifications, clients, factures, ia, absences, suggestion_devis
from app.core.database import engine, Base
from app.services import notifications as notif_service
from app.services import vecteurs as vecteurs_service
import app.models

# Création de l'application
app = FastAPI(
    title="Kanto - API",
    description="Plateforme de gestion de projets assistée par l'IA",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    # Dev : tout port localhost/127.0.0.1  |  Prod : les (sous-)domaines bef4prod.com en HTTPS
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routers
app.include_router(auth.router)
app.include_router(projets.router)
app.include_router(taches.router)
app.include_router(dashboard.router)
app.include_router(client.router)
app.include_router(fichiers.router)
app.include_router(utilisateurs.router)
app.include_router(notifications.router)
app.include_router(clients.router)
app.include_router(factures.router)
app.include_router(ia.router)
app.include_router(absences.router)
app.include_router(suggestion_devis.router)

@app.on_event("startup")
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Migration idempotente : devise du client (national = "Ar", sinon international)
        await conn.execute(
            text("ALTER TABLE client ADD COLUMN IF NOT EXISTS devise VARCHAR(10) NOT NULL DEFAULT 'Ar'")
        )
        # Migration idempotente : marqueur d'alerte de retard sur les tâches.
        # `create_all` ne modifie jamais une table déjà créée : sur une base
        # existante, seule cette instruction ajoute la colonne.
        await conn.execute(
            text("ALTER TABLE tache ADD COLUMN IF NOT EXISTS retard_notifie_le TIMESTAMPTZ")
        )
        # Recherche sémantique (RF-31) : table document_chunk + index pgvector.
        # Sans l'extension `vector`, ne fait rien (recherche plein texte seule).
        await vecteurs_service.preparer_base(conn)
    # Le modèle d'embeddings se charge en arrière-plan : le démarrage de l'API
    # n'attend pas son premier téléchargement (~500 Mo).
    app.state.prechargement_embeddings = asyncio.create_task(vecteurs_service.precharger_modele())
    # Le retard apparaît avec le temps, sans action utilisateur : une boucle de
    # fond le détecte et crée les notifications (direction, chef de projet,
    # client du projet).
    notif_service.demarrer_surveillance_retards()


@app.on_event("shutdown")
async def stopper_surveillance():
    await notif_service.arreter_surveillance_retards()

@app.get("/")
async def root():
    return {
        "message": "Bienvenue sur l'API Gestion projet",
        "docs": "/docs",
        "redoc": "/redoc",
    }

@app.get("/health")
async def health_check():
    return {"status": "ok"}
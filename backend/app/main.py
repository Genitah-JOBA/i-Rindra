# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, projets, taches, dashboard, client, fichiers, utilisateurs, notifications, clients, factures, ia, absences
from app.core.database import engine, Base
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

@app.on_event("startup")
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, projets, taches, dashboard, client, fichiers, utilisateurs, notifications, clients
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
    # Autorise n'importe quel port localhost/127.0.0.1 en développement
    # (Vite peut basculer sur 5174, 5175… si 5173 est déjà pris).
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
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
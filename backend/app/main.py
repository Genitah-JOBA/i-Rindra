# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, projets, taches
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
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routers
app.include_router(auth.router)
app.include_router(projets.router)
app.include_router(taches.router)

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
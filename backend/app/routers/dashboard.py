# app/routers/dashboard.py

"""
Routes pour le Dashboard (RF-16 à RF-18).
Vue globale des projets, indicateurs et alertes.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from datetime import datetime, timedelta, date
from typing import List, Optional

from app.core.database import get_db
from app.core.security import decode_access_token
from app.routers.auth import oauth2_scheme
from app.models.projet import Projet, StatutSante
from app.models.tache import Tache, StatutTache
from app.models.projet_membre import ProjetMembre
from app.models.utilisateur import Utilisateur
from app.schemas.dashboard import (
    DashboardProjet,
    DashboardIndicateurs,
    DashboardAlerte,
    DashboardResponse,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

# ============================================================
# DASHBOARD PRINCIPAL
# ============================================================

@router.get("/projets", response_model=List[DashboardProjet])
async def get_dashboard_projets(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Vue globale des projets avec leur santé (RF-16, RF-17).
    
    Retourne tous les projets accessibles à l'utilisateur
    avec leur statut de santé et avancement.
    """
    # 1. Récupère l'utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    # 2. Construction de la requête
    query = select(Projet).where(Projet.archive == False)
    
    # 3. Filtrage selon le rôle
    if role == "direction":
        # Direction : voit tout
        pass
    
    elif role == "equipe":
        # Chef de projet : voit ses projets
        subquery_membre = select(ProjetMembre.projet_id).where(
            ProjetMembre.utilisateur_id == user_id
        )
        query = query.where(
            or_(
                Projet.responsable_id == user_id,
                Projet.id.in_(subquery_membre)
            )
        )
    
    elif role == "client":
        # Client : voit son projet
        if client_id:
            query = query.where(Projet.client_id == client_id)
        else:
            return []
    
    # 4. Exécution
    result = await db.execute(query)
    projets = result.scalars().all()
    
    # 5. Construction de la réponse
    response = []
    for projet in projets:
        # Compte les tâches par statut
        result = await db.execute(
            select(
                Tache.statut,
                func.count(Tache.id)
            )
            .where(Tache.projet_id == projet.id)
            .group_by(Tache.statut)
        )
        stats = {row[0]: row[1] for row in result.all()}
        
        total = sum(stats.values()) or 1
        termine = stats.get(StatutTache.TERMINE, 0)
        
        # Vérifie les retards (RF-18)
        en_retard = False
        jours_retard = None
        
        if projet.date_fin_prevue and projet.date_fin_prevue < date.today():
            if projet.avancement_pct < 100:   # projet non terminé
                en_retard = True
                jours_retard = (date.today() - projet.date_fin_prevue).days
        
        response.append(DashboardProjet(
            id=projet.id,
            nom=projet.nom,
            statut_sante=projet.statut_sante,
            avancement_pct=projet.avancement_pct,
            date_debut=projet.date_debut,
            date_fin_prevue=projet.date_fin_prevue,
            responsable_id=projet.responsable_id,
            client_id=projet.client_id,
            nb_taches_total=total,
            nb_taches_terminees=termine,
            en_retard=en_retard,
            jours_retard=jours_retard,
        ))
    
    return response

@router.get("/indicateurs", response_model=DashboardIndicateurs)
async def get_dashboard_indicateurs(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Indicateurs globaux pour le dashboard (RF-17).
    
    Retourne des statistiques agrégées :
    - Nombre total de projets
    - Répartition par statut de santé
    - Nombre de tâches par statut
    - Tâches en retard
    """
    # 1. Récupère l'utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    # 2. Filtre les projets accessibles
    query_projets = select(Projet).where(Projet.archive == False)
    
    if role == "direction":
        pass
    elif role == "equipe":
        subquery_membre = select(ProjetMembre.projet_id).where(
            ProjetMembre.utilisateur_id == user_id
        )
        query_projets = query_projets.where(
            or_(
                Projet.responsable_id == user_id,
                Projet.id.in_(subquery_membre)
            )
        )
    elif role == "client":
        if client_id:
            query_projets = query_projets.where(Projet.client_id == client_id)
        else:
            return DashboardIndicateurs(
                total_projets=0,
                sante_vert=0,
                sante_orange=0,
                sante_rouge=0,
                total_taches=0,
                taches_a_faire=0,
                taches_en_cours=0,
                taches_en_revue=0,
                taches_terminees=0,
                taches_retard=0,
            )
    
    # 3. Récupère les projets
    result = await db.execute(query_projets)
    projets = result.scalars().all()
    projet_ids = [p.id for p in projets]
    
    # 4. Statistiques des projets
    total_projets = len(projets)
    sante_vert = sum(1 for p in projets if p.statut_sante == StatutSante.VERT)
    sante_orange = sum(1 for p in projets if p.statut_sante == StatutSante.ORANGE)
    sante_rouge = sum(1 for p in projets if p.statut_sante == StatutSante.ROUGE)
    
    # 5. Statistiques des tâches
    if projet_ids:
        # Tâches par statut
        result = await db.execute(
            select(
                Tache.statut,
                func.count(Tache.id)
            )
            .where(Tache.projet_id.in_(projet_ids))
            .group_by(Tache.statut)
        )
        stats = {row[0]: row[1] for row in result.all()}
        
        total_taches = sum(stats.values()) or 0
        taches_a_faire = stats.get(StatutTache.A_FAIRE, 0)
        taches_en_cours = stats.get(StatutTache.EN_COURS, 0)
        taches_en_revue = stats.get(StatutTache.EN_REVUE, 0)
        taches_terminees = stats.get(StatutTache.TERMINE, 0)
        
        # Tâches en retard (échéance dépassée et non terminées)
        result = await db.execute(
            select(func.count(Tache.id))
            .where(
                and_(
                    Tache.projet_id.in_(projet_ids),
                    Tache.echeance < date.today(),
                    Tache.statut != StatutTache.TERMINE
                )
            )
        )
        taches_retard = result.scalar_one_or_none() or 0
    else:
        total_taches = 0
        taches_a_faire = 0
        taches_en_cours = 0
        taches_en_revue = 0
        taches_terminees = 0
        taches_retard = 0
    
    return DashboardIndicateurs(
        total_projets=total_projets,
        sante_vert=sante_vert,
        sante_orange=sante_orange,
        sante_rouge=sante_rouge,
        total_taches=total_taches,
        taches_a_faire=taches_a_faire,
        taches_en_cours=taches_en_cours,
        taches_en_revue=taches_en_revue,
        taches_terminees=taches_terminees,
        taches_retard=taches_retard,
    )

@router.get("/alertes", response_model=List[DashboardAlerte])
async def get_dashboard_alertes(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    limit: int = 10
):
    """
    Alertes pour le dashboard (RF-18).
    
    Types d'alertes :
    - Projet en retard
    - Tâche en retard
    - Projet en statut rouge
    - Deadline approchante (dans 7 jours)
    """
    # 1. Récupère l'utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    role = payload.get("role")
    client_id = payload.get("client_id")
    
    # 2. Filtre les projets accessibles
    query_projets = select(Projet).where(Projet.archive == False)
    
    if role == "direction":
        pass
    elif role == "equipe":
        subquery_membre = select(ProjetMembre.projet_id).where(
            ProjetMembre.utilisateur_id == user_id
        )
        query_projets = query_projets.where(
            or_(
                Projet.responsable_id == user_id,
                Projet.id.in_(subquery_membre)
            )
        )
    elif role == "client":
        if client_id:
            query_projets = query_projets.where(Projet.client_id == client_id)
        else:
            return []
    
    result = await db.execute(query_projets)
    projets = result.scalars().all()
    projet_ids = [p.id for p in projets]
    
    alertes = []
    
    # 3. Alertes : Projets en retard
    for projet in projets:
        if projet.date_fin_prevue and projet.date_fin_prevue < date.today():
            if projet.avancement_pct < 100:   # projet non terminé
                jours = (date.today() - projet.date_fin_prevue).days
                alertes.append(DashboardAlerte(
                    type="projet_retard",
                    message=f"Le projet '{projet.nom}' est en retard de {jours} jours",
                    priorite="haute",
                    projet_id=projet.id,
                    date=date.today(),
                ))
        
        # Alertes : Projet en rouge
        if projet.statut_sante == StatutSante.ROUGE:
            alertes.append(DashboardAlerte(
                type="projet_rouge",
                message=f"Le projet '{projet.nom}' est en statut ROUGE",
                priorite="haute",
                projet_id=projet.id,
                date=date.today(),
            ))
    
    # 4. Alertes : Tâches en retard
    if projet_ids:
        result = await db.execute(
            select(Tache)
            .where(
                and_(
                    Tache.projet_id.in_(projet_ids),
                    Tache.echeance < date.today(),
                    Tache.statut != StatutTache.TERMINE
                )
            )
            .limit(limit - len(alertes))
        )
        taches_retard = result.scalars().all()
        
        for tache in taches_retard:
            jours = (date.today() - tache.echeance).days
            alertes.append(DashboardAlerte(
                type="tache_retard",
                message=f"La tâche '{tache.titre}' est en retard de {jours} jours",
                priorite="moyenne",
                projet_id=tache.projet_id,
                tache_id=tache.id,
                date=date.today(),
            ))
        
        # 5. Alertes : Deadlines approchantes (dans 7 jours)
        if len(alertes) < limit:
            date_limite = date.today() + timedelta(days=7)
            result = await db.execute(
                select(Tache)
                .where(
                    and_(
                        Tache.projet_id.in_(projet_ids),
                        Tache.echeance <= date_limite,
                        Tache.echeance >= date.today(),
                        Tache.statut != StatutTache.TERMINE
                    )
                )
                .order_by(Tache.echeance)
                .limit(limit - len(alertes))
            )
            taches_approche = result.scalars().all()
            
            for tache in taches_approche:
                jours = (tache.echeance - date.today()).days
                alertes.append(DashboardAlerte(
                    type="deadline_approche",
                    message=f"La tâche '{tache.titre}' est due dans {jours} jours",
                    priorite="basse",
                    projet_id=tache.projet_id,
                    tache_id=tache.id,
                    date=tache.echeance,
                ))
    
    # Trier par priorité et date
    priorite_order = {"haute": 0, "moyenne": 1, "basse": 2}
    alertes.sort(key=lambda x: (priorite_order.get(x.priorite, 3), x.date))
    
    return alertes[:limit]
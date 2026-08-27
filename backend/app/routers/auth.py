# auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.models.utilisateur import Utilisateur, RoleUtilisateur
from app.models.client import Client
from pydantic import BaseModel, EmailStr
from datetime import timedelta
from typing import Optional

# On crée un routeur pour regrouper toutes les routes d'authentification
router = APIRouter(prefix="/auth", tags=["Authentification"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Validation d'entréet sortie

class LoginRequest(BaseModel):
    email: EmailStr
    mot_de_passe: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    nom: str
    prenom: str
    role: str

class UserResponse(BaseModel):
    id: int
    email: str
    nom: str
    prenom: str
    role: str
    actif: bool
    client_id: Optional[int] = None

# Endpoint

@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),  # <- Format standard OAuth2
    db: AsyncSession = Depends(get_db)
):
    """
    Authentifie un utilisateur par email/mot de passe.
    Retourne un token JWT si les identifiants sont corrects.
    
    OAuth2PasswordRequestForm attend les champs :
       - username (on utilisera l'email ici)
       - password
    """
    # 1. Recherche d'utilisateur par email
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.email == form_data.username)
    )
    user = result.scalar_one_or_none()
    
    # 2. Vérifie que l'utilisateur existe et que le mot de passe est correct
    if not user or not verify_password(form_data.password, user.mot_de_passe_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 3. Vérifie que le compte est actif
    if not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )
    
    # 4. Crée le token JWT avec les informations de l'utilisateur
    token_data = {
        "sub": str(user.id),
        "role": user.role.value,
        "email": user.email,
        "client_id": user.client_id,
    }
    access_token = create_access_token(token_data)
    
    # 5. Retourne le token + infos utilisateur
    return TokenResponse(
        access_token=access_token,
        user_id=user.id,
        nom=user.nom,
        prenom=user.prenom,
        role=user.role.value,
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    """
    Retourne les informations de l'utilisateur connecté à partir du token JWT.
    """
    # 1. Décode le token pour récupérer l'ID utilisateur
    payload = decode_access_token(token)
    user_id = int(payload.get("sub"))
    
    # 2. Récupère l'utilisateur en BD
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.id == user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur non trouvé"
        )
    
    if not user.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé"
        )
    
    return UserResponse(
        id=user.id,
        email=user.email,
        nom=user.nom,
        prenom=user.prenom,
        role=user.role.value,
        actif=user.actif,
        client_id=user.client_id,
    )

@router.post("/logout")
async def logout():
    """
    Déconnexion côté client : 
    Le token est invalidé côté frontend (on le supprime du localStorage).
    Ici, on ne fait rien car l'API est stateless (JWT).
    """
    return {"message": "Déconnexion réussie"}

async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> int:
    """
    Dépendance réutilisable pour récupérer l'ID de l'utilisateur connecté.
    À utiliser dans les autres routes.
    """
    payload = decode_access_token(token)
    return int(payload.get("sub"))

async def get_current_user_role(token: str = Depends(oauth2_scheme)) -> str:
    """
    Dépendance réutilisable pour récupérer le rôle de l'utilisateur connecté.
    """
    payload = decode_access_token(token)
    return payload.get("role")

# -Inscription
class RegisterRequest(BaseModel):
    email: EmailStr
    mot_de_passe: str
    nom: str
    prenom: str
    role: Optional[str] = "equipe"
    client_id: Optional[int] = None   # obligatoire UNIQUEMENT si role = "client"

class RegisterResponse(BaseModel):
    id: int
    email: str
    nom: str
    prenom: str
    role: str
    message: str

# ENDPOINT D'INSCRIPTION
@router.post("/register", response_model=RegisterResponse)
async def register(
    user_data: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Crée un nouvel utilisateur.
    Le mot de passe est hashé automatiquement.
    
    Pour la version prototype, tout le monde peut s'inscrire.
    En production, seul un admin/direction peut créer des comptes.
    """
    # 1. Vérifie que l'email n'est pas déjà utilisé
    result = await db.execute(
        select(Utilisateur).where(Utilisateur.email == user_data.email)
    )
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet email est déjà utilisé"
        )
    
    # 2. Valide le rôle
    try:
        role_enum = RoleUtilisateur(user_data.role)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Rôle invalide. Choisir parmi : {[r.value for r in RoleUtilisateur]}"
        )

    # 3. Règle métier (CDC) : cohérence rôle / client_id
    #    - un compte 'client' DOIT être rattaché à un client existant
    #    - un compte interne (direction/equipe) N'est rattaché à aucun client
    if role_enum == RoleUtilisateur.CLIENT:
        if user_data.client_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un compte 'client' doit être rattaché à un client (client_id requis)."
            )
        result = await db.execute(
            select(Client).where(Client.id == user_data.client_id)
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Le client id={user_data.client_id} n'existe pas."
            )
        client_id_final = user_data.client_id
    else:
        client_id_final = None   # imposé par la contrainte chk_client_lien

    # 4. Crée le nouvel utilisateur
    new_user = Utilisateur(
        email=user_data.email,
        mot_de_passe_hash=hash_password(user_data.mot_de_passe),
        nom=user_data.nom,
        prenom=user_data.prenom,
        role=role_enum,
        actif=True,
        client_id=client_id_final,
    )
    
    # 5. Sauvegarde en base de données
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return RegisterResponse(
        id=new_user.id,
        email=new_user.email,
        nom=new_user.nom,
        prenom=new_user.prenom,
        role=new_user.role.value,
        message="Utilisateur créé avec succès"
    )
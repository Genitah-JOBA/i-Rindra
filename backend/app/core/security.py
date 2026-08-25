# security.py
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status

from app.core.config import settings

# Hachage des MDP
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    """
    Hache un mot de passe en clair.
    Utilise bcrypt avec un salt généré automatiquement.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Vérifie qu'un mot de passe en clair correspond au hash stocké.
    Retourne True si OK.
    """
    return pwd_context.verify(plain_password, hashed_password)

# JWT
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Crée un token JWT avec les données fournies.
    Le token expire après `ACCESS_TOKEN_EXPIRE_MINUTES` minutes.
    
    Exemple d'utilisation :
    token = create_access_token({"sub": user_id, "role": "direction"})
    """
    to_encode = data.copy()
    
    # Définit la date d'expiration
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    
    # Génère le token signé
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> dict:
    """
    Décode un token JWT et retourne les données qu'il contient.
    Lève une exception si le token est invalide ou expiré.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )

def get_user_id_from_token(token: str) -> int:
    """
    Extrait l'ID de l'utilisateur depuis un token JWT.
    Utile pour savoir qui fait la requête.
    """
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide : 'sub' manquant",
        )
    return int(user_id)

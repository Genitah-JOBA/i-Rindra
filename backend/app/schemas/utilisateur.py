# app/schemas/utilisateur.py
"""
Schémas Pydantic pour la gestion des utilisateurs (RF-02).
"""
from app.utils.mots_de_passe import LONGUEUR_MAX, verifier_mot_de_passe
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator
from datetime import datetime
from typing import Optional
import re

# Nom / prénom : lettres (accents compris), séparées par une espace, un tiret ou
# une apostrophe (« Jean-Pierre », « N'Diaye »). Ni chiffre ni caractère spécial.
_NOM_VALIDE = re.compile(r"^[^\W\d_]+(?:[ '’-][^\W\d_]+)*$")
ROLES_SANS_METIER = ("client",)


def valider_nom(valeur: Optional[str], champ: str) -> Optional[str]:
    if valeur is None:
        return None
    valeur = " ".join(valeur.split())
    if not _NOM_VALIDE.match(valeur):
        raise ValueError(
            f"Le {champ} ne doit contenir que des lettres, espaces, tirets ou apostrophes "
            "(pas de chiffre ni de caractère spécial)."
        )
    return valeur


def valider_metier(valeur: Optional[str]) -> Optional[str]:
    if valeur is None:
        return None
    valeur = valeur.strip()
    if not valeur:
        raise ValueError("Le métier est obligatoire.")
    return valeur



class UtilisateurBase(BaseModel):
    nom: str = Field(..., min_length=1, max_length=100)
    prenom: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    role: str = Field("equipe", description="direction | drh | chef_de_projet | equipe | client")
    metier: Optional[str] = Field(None, description="développeur, graphiste, intégrateur…")
    client_id: Optional[int] = None

    @field_validator("nom")
    @classmethod
    def _verifier_nom(cls, valeur: str) -> str:
        return valider_nom(valeur, "nom")

    @field_validator("prenom")
    @classmethod
    def _verifier_prenom(cls, valeur: str) -> str:
        return valider_nom(valeur, "prénom")

    @field_validator("metier")
    @classmethod
    def _verifier_metier(cls, valeur: Optional[str]) -> Optional[str]:
        return valeur.strip() or None if valeur is not None else None

    @model_validator(mode="after")
    def _metier_obligatoire(self):
        # Obligatoire pour l'équipe interne : il sert à savoir qui affecter à une tâche.
        if self.role not in ROLES_SANS_METIER and not self.metier:
            raise ValueError("Le métier est obligatoire.")
        return self


class UtilisateurCreate(UtilisateurBase):
    # La politique (longueur, majuscule, chiffre) est validée par le même
    # validateur que le reste de l'application — voir utils/mots_de_passe.py.
    mot_de_passe: str = Field(..., max_length=LONGUEUR_MAX)

    @field_validator("mot_de_passe")
    @classmethod
    def _verifier_mot_de_passe(cls, valeur: str) -> str:
        erreur = verifier_mot_de_passe(valeur)
        if erreur:
            raise ValueError(erreur)
        return valeur


class UtilisateurUpdate(BaseModel):
    nom: Optional[str] = Field(None, min_length=1, max_length=100)
    prenom: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    metier: Optional[str] = None
    client_id: Optional[int] = None
    actif: Optional[bool] = None

    @field_validator("nom")
    @classmethod
    def _verifier_nom(cls, valeur: Optional[str]) -> Optional[str]:
        return valider_nom(valeur, "nom")

    @field_validator("prenom")
    @classmethod
    def _verifier_prenom(cls, valeur: Optional[str]) -> Optional[str]:
        return valider_nom(valeur, "prénom")

    @field_validator("metier")
    @classmethod
    def _verifier_metier(cls, valeur: Optional[str]) -> Optional[str]:
        # Envoyé vide = effacement refusé ; absent (None) = inchangé.
        return valider_metier(valeur)


class UtilisateurResponse(BaseModel):
    id: int
    nom: str
    prenom: str
    email: str
    role: str
    metier: Optional[str] = None
    client_id: Optional[int] = None
    actif: bool
    cree_le: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

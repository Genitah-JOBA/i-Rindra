# tests/test_texte_documents.py — nettoyage du texte extrait avant enregistrement
from app.services.texte_documents import _extraire_texte_brut, nettoyer_texte


def test_nettoyer_texte_retire_nul_et_controles():
    # NUL (0x00) faisait échouer l'INSERT PostgreSQL (« encodage UTF8 ») -> erreur 500
    assert nettoyer_texte("Cahier\x00 des\x07 charges\x7f") == "Cahier des charges"


def test_nettoyer_texte_garde_tabulations_et_retours():
    assert nettoyer_texte("a\tb\nc\r\nd") == "a\tb\nc\r\nd"


def test_nettoyer_texte_none():
    assert nettoyer_texte(None) == ""


def test_texte_brut_utf16_avec_bom():
    contenu = "Objectif : site vitrine".encode("utf-16")  # BOM inclus
    texte = _extraire_texte_brut(contenu)
    assert texte == "Objectif : site vitrine"
    assert "\x00" not in texte


def test_texte_brut_utf8_avec_bom():
    assert _extraire_texte_brut("﻿Étape 1".encode("utf-8")) == "Étape 1"

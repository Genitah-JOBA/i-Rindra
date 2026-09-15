# app/services/texte_documents.py
"""
Extraction de texte depuis un fichier importé (cahier des charges, RF-25).

Formats pris en charge :
  - texte brut : .txt, .md, .csv
  - PDF : .pdf (via PyMuPDF)
  - Word : .docx (via python-docx), .doc legacy (best-effort)
  - images : .png, .jpg, .jpeg (transcription vision via OpenAI)

Le service retourne un texte brut prêt à être injecté dans le prompt IA.
"""
import base64
import io
import logging
import re
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.services.connectors.llm import LLMProviderError, transcrire_image

logger = logging.getLogger(__name__)

try:
    import fitz as pymupdf
except ImportError:  # pragma: no cover
    import pymupdf

try:
    from docx import Document as DocxDocument
except ImportError:  # pragma: no cover
    DocxDocument = None

TYPES_IMAGE = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}

# Limite sur la taille du fichier importé (15 Mo brut).
MAX_FICHIER_OCTETS = 15 * 1024 * 1024
# Le modèle vision accepte une image encodée d'environ 10 Mo max.
MAX_IMAGE_B64 = 10 * 1024 * 1024
# Taille maximale du texte injecté dans le prompt (~190 Ko).
MAX_TEXTE_CARACTERES = 190_000
# Un texte d'image / doc avec moins de caractères est jugé inexploitable.
MIN_TEXTE_CARACTERES = 20


async def extraire_texte_fichier(fichier: UploadFile) -> str:
    """Extrait le texte d'un fichier importé selon son extension."""
    suffix = Path(fichier.filename or "").suffix.lower()
    if suffix not in {"", ".txt", ".md", ".csv", ".pdf", ".docx", ".doc"} and suffix not in TYPES_IMAGE:
        raise HTTPException(
            status_code=415,
            detail="Format non pris en charge. Formats acceptés : .doc, .docx, .pdf, .png, .jpg.",
        )

    contenu = await fichier.read()
    if not contenu:
        raise HTTPException(status_code=400, detail="Le fichier est vide.")
    if len(contenu) > MAX_FICHIER_OCTETS:
        raise HTTPException(
            status_code=413,
            detail="Fichier trop volumineux (maximum 15 Mo).",
        )

    if suffix in TYPES_IMAGE:
        return await _extraire_image(contenu, suffix)
    if suffix == ".pdf":
        return _extraire_pdf(contenu)
    if suffix == ".docx":
        return _extraire_docx(contenu)
    if suffix == ".doc":
        return _extraire_doc_legacy(contenu)
    return _extraire_texte_brut(contenu)


def _extraire_texte_brut(contenu: bytes) -> str:
    """Texte plat (.txt/.md/.csv) : décode en UTF-8 puis latin-1 en secours."""
    for enc in ("utf-8", "latin-1"):
        try:
            return contenu.decode(enc).strip()
        except UnicodeDecodeError:
            continue
    return contenu.decode("utf-8", errors="replace").strip()


def _extraire_pdf(contenu: bytes) -> str:
    """Texte d'un PDF : extraction des pages via PyMuPDF."""
    try:
        doc = pymupdf.open(stream=contenu, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        logger.warning("PDF illisible : %s", exc)
        raise HTTPException(status_code=400, detail="PDF illisible ou scanné sans texte.") from exc
    pages = []
    for page in doc:
        try:
            txt = page.get_text().strip()
        except Exception:  # noqa: BLE001
            txt = ""
        if txt:
            pages.append(txt)
    doc.close()
    return "\n\n".join(pages)[:MAX_TEXTE_CARACTERES].strip()


def _extraire_docx(contenu: bytes) -> str:
    """Texte d'un .docx : paragraphes + tableaux via python-docx."""
    if DocxDocument is None:
        raise HTTPException(status_code=500, detail="Module de lecture DOCX indisponible.")
    try:
        doc = DocxDocument(io.BytesIO(contenu))
    except Exception as exc:  # noqa: BLE001
        logger.warning("DOCX illisible : %s", exc)
        raise HTTPException(status_code=400, detail="Fichier DOCX illisible.") from exc

    parties = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            cellules = [c.text.strip() for c in row.cells if c.text and c.text.strip()]
            if cellules:
                parties.append(" | ".join(cellules))
    return "\n".join(parties)[:MAX_TEXTE_CARACTERES].strip()


def _chunks_lisibles(contenu: bytes) -> list[str]:
    """
    Récupère les morceaux de texte lisibles d'un flux binaire (.doc legacy).
    Le format OLE2 contient souvent le texte en ANSI + une copie UTF-16LE :
    on collecte les deux, en ne gardant que les séquences utiles.
    """
    latin = contenu.decode("latin-1", errors="ignore")
    ansi = re.findall(r"[\x20-\x7eÀ-ÿ]{4,}", latin)
    utf16 = contenu.decode("utf-16-le", errors="ignore")
    unicode_txt = re.findall(r"[\x20-\x7eÀ-ÿ]{4,}", utf16)
    return [b.strip() for b in (*ansi, *unicode_txt) if b.strip()]


def _extraire_doc_legacy(contenu: bytes) -> str:
    """Extraction best-effort d'un .doc (ancien format binaire Word)."""
    blocs = _chunks_lisibles(contenu)
    if not blocs:
        raise HTTPException(
            status_code=400,
            detail="Impossible d'extraire du texte de ce .doc. Convertissez-le en .docx ou .pdf.",
        )
    texte = "\n".join(blocs)
    if len(texte) < MIN_TEXTE_CARACTERES:
        raise HTTPException(
            status_code=400,
            detail="Texte trop court dans ce .doc. Convertissez-le en .docx ou .pdf.",
        )
    return texte[:MAX_TEXTE_CARACTERES].strip()


async def _extraire_image(contenu: bytes, suffix: str) -> str:
    """Transcrit le texte d'une image (OCR) via le modèle vision d'OpenAI."""
    mime = TYPES_IMAGE[suffix]
    b64 = base64.b64encode(contenu).decode("ascii")
    if len(b64) > MAX_IMAGE_B64:
        raise HTTPException(
            status_code=413,
            detail="Image trop volumineuse pour l'analyse (maximum ~7 Mo).",
        )
    try:
        resultat = await transcrire_image(
            image_base64=b64,
            mime=mime,
            prompt=(
                "Tu es un outil d'OCR. Transcribes intégralement tout le texte "
                "visible sur cette image (cahier des charges, document).\n"
                "Restitue le contenu tel quel, sans commentaire, sans résumé "
                "et sans reformulation. Si l'image ne contient aucun texte, "
                "réponds juste : AUCUN_TEXTE."
            ),
        )
    except LLMProviderError as exc:
        logger.warning("Transcription d'image impossible : %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Transcription de l'image impossible ({exc}).",
        ) from exc

    texte = (resultat.content or "").strip()
    if "AUCUN_TEXTE" in texte:
        raise HTTPException(
            status_code=400,
            detail="Aucun texte détecté sur cette image.",
        )
    return texte[:MAX_TEXTE_CARACTERES]
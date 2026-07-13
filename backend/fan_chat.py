"""
fan_chat.py — CrowdSense AI Fan Chat Module
============================================
Multilingual stadium assistant powered by:
  • LangChain LCEL chain composition
  • FAISS (raw index) for vector retrieval → LangChain Documents
  • Gemini 2.5 Flash (via langchain-google-genai) for generation
  • langdetect for language auto-detection

Supported languages & FIFA 2026 target nations:
  en – English    (USA, Canada, England, Australia)
  es – Spanish    (Mexico, Colombia, Argentina)
  pt – Portuguese (Brazil)
  de – German     (Germany)
  fr – French     (France)

Graceful fallback: if GOOGLE_API_KEY is not set the module falls back
to a keyword-ranked deterministic synthesis so the endpoint always responds.
"""

from __future__ import annotations

import os
from typing import Optional

import numpy as np
from langdetect import detect, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage

DetectorFactory.seed = 0  # reproducible language detection

# ── Constants ─────────────────────────────────────────────────────────────────

SUPPORTED_LANGUAGES = {"en", "es", "pt", "de", "fr"}

LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Español",
    "pt": "Português",
    "de": "Deutsch",
    "fr": "Français",
}

# Codes that map to a supported language
_LANG_ALIASES: dict[str, str] = {
    "ca": "es",    # Catalan → Spanish
    "gl": "es",    # Galician → Spanish
    "oc": "fr",    # Occitan → French
    "br": "pt",    # Breton → Portuguese (edge case)
    "en-us": "en",
    "en-gb": "en",
}

# ── Multilingual system prompts ────────────────────────────────────────────────

SYSTEM_PROMPTS: dict[str, str] = {
    "en": (
        "You are CrowdSense AI, a warm, knowledgeable FIFA World Cup 2026 stadium assistant "
        "at MetLife Stadium, East Rutherford, NJ (capacity 60,000 seats). "
        "Your job is to help fans navigate the stadium: find restrooms, food courts, medical stations, "
        "accessible entries, and gates quickly and clearly. "
        "Always respond in natural, friendly English. Be concise — fans are on their feet. "
        "If the fan has shared their gate or section, tailor your directions from that location. "
        "Ground every answer in the stadium knowledge base provided. "
        "If the context doesn't contain enough to answer, say so honestly and suggest asking stadium staff."
    ),
    "es": (
        "Eres CrowdSense AI, un asistente de estadio amable y experto para la Copa Mundial FIFA 2026 "
        "en el MetLife Stadium, East Rutherford, NJ (capacidad 60.000 asientos). "
        "Tu misión es ayudar a los fanáticos a navegar el estadio: encontrar baños, patios de comidas, "
        "estaciones médicas, entradas accesibles y puertas de forma rápida y clara. "
        "Responde siempre en español natural y amigable. Sé conciso — los fanáticos están de pie. "
        "Si el fanático compartió su puerta o sección, personaliza las indicaciones desde esa ubicación. "
        "Basa cada respuesta en la base de conocimiento del estadio proporcionada. "
        "Si el contexto no es suficiente, dilo con honestidad y sugiere preguntar al personal del estadio."
    ),
    "pt": (
        "Você é CrowdSense AI, um assistente de estádio caloroso e experiente para a Copa do Mundo FIFA 2026 "
        "no MetLife Stadium, East Rutherford, NJ (capacidade 60.000 lugares). "
        "Sua missão é ajudar os torcedores a navegar pelo estádio: encontrar banheiros, praças de alimentação, "
        "postos médicos, entradas acessíveis e portões de forma rápida e clara. "
        "Responda sempre em português natural e acolhedor. Seja conciso — os torcedores estão de pé. "
        "Se o torcedor compartilhou seu portão ou seção, personalize as direções a partir dessa localização. "
        "Baseie cada resposta na base de conhecimento do estádio fornecida. "
        "Se o contexto não for suficiente, seja honesto e sugira perguntar à equipe do estádio."
    ),
    "de": (
        "Du bist CrowdSense AI, ein freundlicher und sachkundiger Stadionassistent für die FIFA Weltmeisterschaft 2026 "
        "im MetLife Stadium, East Rutherford, NJ (Kapazität 60.000 Plätze). "
        "Deine Aufgabe ist es, Fans bei der Navigation durch das Stadion zu helfen: Toiletten, Essensbereiche, "
        "Sanitätsstationen, barrierefreie Eingänge und Tore schnell und verständlich zu finden. "
        "Antworte immer auf natürlichem, freundlichem Deutsch. Sei präzise — die Fans stehen auf ihren Füßen. "
        "Wenn der Fan seinen Eingang oder seine Sektion angegeben hat, passe die Wegbeschreibung an diesen Standort an. "
        "Stütze jede Antwort auf die bereitgestellte Stadion-Wissensdatenbank. "
        "Wenn der Kontext nicht ausreicht, sag das ehrlich und empfehle, das Stadionpersonal zu fragen."
    ),
    "fr": (
        "Tu es CrowdSense AI, un assistant de stade chaleureux et expert pour la Coupe du Monde FIFA 2026 "
        "au MetLife Stadium, East Rutherford, NJ (capacité 60 000 places). "
        "Ta mission est d'aider les supporters à naviguer dans le stade : trouver les toilettes, les espaces de restauration, "
        "les postes médicaux, les entrées accessibles et les portes rapidement et clairement. "
        "Réponds toujours en français naturel et chaleureux. Sois concis — les supporters sont debout. "
        "Si le supporter a partagé sa porte ou sa section, personnalise les indications depuis cet emplacement. "
        "Base chaque réponse sur la base de connaissances du stade fournie. "
        "Si le contexte est insuffisant, sois honnête et suggère de demander au personnel du stade."
    ),
}

# ── Fallback strings (no Claude) ──────────────────────────────────────────────

_FALLBACK_INTRO: dict[str, str] = {
    "en": "Based on the stadium information I have:\n\n",
    "es": "Según la información del estadio que tengo:\n\n",
    "pt": "Com base nas informações do estádio que tenho:\n\n",
    "de": "Basierend auf den Stadioninformationen, die ich habe:\n\n",
    "fr": "D'après les informations du stade que j'ai:\n\n",
}

_FALLBACK_NOT_FOUND: dict[str, str] = {
    "en": "I don't have enough information to answer that precisely. Please ask a stadium staff member for help.",
    "es": "No tengo suficiente información para responder eso con precisión. Por favor, pide ayuda al personal del estadio.",
    "pt": "Não tenho informações suficientes para responder isso com precisão. Por favor, peça ajuda à equipe do estádio.",
    "de": "Ich habe nicht genug Informationen, um das genau zu beantworten. Bitte fragen Sie das Stadionpersonal um Hilfe.",
    "fr": "Je n'ai pas assez d'informations pour répondre précisément à cela. Veuillez demander de l'aide au personnel du stade.",
}

_NO_KEY_WARNING: dict[str, str] = {
    "en": "⚠️ AI generation unavailable (no ANTHROPIC_API_KEY configured). Showing retrieved information only.",
    "es": "⚠️ Generación de IA no disponible (sin clave ANTHROPIC_API_KEY). Mostrando solo información recuperada.",
    "pt": "⚠️ Geração de IA indisponível (sem ANTHROPIC_API_KEY). Exibindo apenas informações recuperadas.",
    "de": "⚠️ KI-Generierung nicht verfügbar (kein ANTHROPIC_API_KEY konfiguriert). Zeige nur abgerufene Informationen.",
    "fr": "⚠️ Génération IA indisponible (aucun ANTHROPIC_API_KEY configuré). Affichage des informations récupérées uniquement.",
}


# ── Language detection ─────────────────────────────────────────────────────────

def detect_language(text: str) -> str:
    """
    Auto-detect the language of `text` using langdetect.
    Returns a code in SUPPORTED_LANGUAGES, defaulting to 'en'.
    """
    if not text or len(text.strip()) < 4:
        return "en"
    try:
        raw = detect(text)
        mapped = _LANG_ALIASES.get(raw, raw)
        return mapped if mapped in SUPPORTED_LANGUAGES else "en"
    except LangDetectException:
        return "en"


# ── FAISS → LangChain Documents ────────────────────────────────────────────────

def retrieve_docs(
    query: str,
    embed_model,
    faiss_index,
    faiss_meta: dict,
    k: int = 5,
) -> list[Document]:
    """
    Embed `query` with sentence-transformers, search the raw FAISS index,
    and wrap results as LangChain Document objects.
    """
    q_vec = embed_model.encode([query], convert_to_numpy=True).astype(np.float32)
    distances, indices = faiss_index.search(q_vec, k)

    chunks: list[str] = faiss_meta["chunks"]
    metas: list[dict] = faiss_meta["metadata"]

    docs: list[Document] = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < 0:
            continue
        docs.append(
            Document(
                page_content=chunks[idx],
                metadata={**metas[idx], "retrieval_score": float(dist)},
            )
        )
    return docs


# ── LLM builder ────────────────────────────────────────────────────────────────

def build_gemini_llm():
    """
    Instantiate ChatGoogleGenerativeAI (gemini-2.5-flash) if GOOGLE_API_KEY is set.
    Returns None on missing key or import error — triggers graceful fallback.
    """
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI  # noqa: PLC0415
        return ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            max_output_tokens=1024,
        )
    except Exception as exc:
        print(f"   WARNING: Could not initialise Gemini LLM: {exc}")
        return None


# ── Density context builder ────────────────────────────────────────────────────

def build_density_summary(density: dict) -> str:
    """Convert the live density JSON to a concise text summary for the LLM context."""
    if not density:
        return ""
    gates = density.get("gates", [])
    totals = density.get("stadium_totals", {})

    lines = [
        f"Stadium occupancy: {totals.get('occupancy_pct', 0):.1f}% "
        f"({totals.get('total_present', 0):,} fans present out of {totals.get('total_capacity', 60000):,}).",
    ]

    critical = [g for g in gates if g.get("status") == "critical"]
    high = [g for g in gates if g.get("status") == "high"]
    if critical:
        names = ", ".join(g["gate_name"] for g in critical)
        lines.append(f"⚠ CRITICAL overcrowding at: {names} — fans should use adjacent gates.")
    if high:
        names = ", ".join(g["gate_name"] for g in high)
        lines.append(f"High density at: {names} — expect longer waits.")

    if gates:
        least = min(gates, key=lambda g: g.get("pct", 100))
        lines.append(
            f"Least crowded gate right now: {least['gate_name']} "
            f"({least.get('pct', 0):.0f}% capacity, ~{least.get('avg_wait_minutes', 0)} min wait)."
        )
    return "\n".join(lines)


# ── Core async fan chat function ───────────────────────────────────────────────

async def fan_chat(
    query: str,
    language: str,
    fan_gate: Optional[str],
    fan_section: Optional[str],
    geolocation: Optional[dict],
    density_summary: str,
    embed_model,
    faiss_index,
    faiss_meta: dict,
    llm,
    k: int = 5,
) -> dict:
    """
    Full RAG pipeline:
    1. Validate language
    2. Retrieve top-k relevant chunks from FAISS → LangChain Documents
    3. Build multilingual system prompt with fan location + crowd context
    4. Call Gemini via LangChain (async ainvoke) — or deterministic fallback
    5. Return structured dict with answer, sources, metadata

    Parameters
    ----------
    query          : fan's natural-language question
    language       : 'en'|'es'|'pt'|'de'|'fr'
    fan_gate       : e.g. 'GATE_C' (from ticket / UI selection)
    fan_section    : e.g. 'SEC_107'
    geolocation    : {'lat': float, 'lng': float} from browser geolocation API (outdoor use)
    density_summary: pre-built crowd context string
    embed_model    : loaded SentenceTransformer instance
    faiss_index    : raw FAISS index
    faiss_meta     : {'chunks': [...], 'metadata': [...]} dict
    llm            : ChatGoogleGenerativeAI instance or None
    k              : number of chunks to retrieve
    """

    # ── 1. Validate / normalise language ──────────────────────────────────
    if language not in SUPPORTED_LANGUAGES:
        language = "en"

    # ── 2. Retrieve context from FAISS ────────────────────────────────────
    docs = retrieve_docs(query, embed_model, faiss_index, faiss_meta, k)
    context_text = "\n\n".join(d.page_content for d in docs)

    # ── 3. Build fan location string ──────────────────────────────────────
    loc_parts: list[str] = []
    if fan_gate:
        loc_parts.append(f"Gate {fan_gate.replace('GATE_', '')}")
    if fan_section:
        loc_parts.append(f"Section {fan_section.replace('SEC_', '')}")
    if geolocation and isinstance(geolocation, dict):
        lat = geolocation.get("lat")
        lng = geolocation.get("lng")
        if lat is not None and lng is not None:
            # Real GPS from browser navigator.geolocation — useful for outdoor routing
            loc_parts.append(f"GPS ({float(lat):.4f}, {float(lng):.4f})")
    fan_location_str = ", ".join(loc_parts) if loc_parts else None

    # ── 4. Assemble system prompt ─────────────────────────────────────────
    system_text = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS["en"])

    if fan_location_str:
        system_text += f"\n\nFan's current location: {fan_location_str}."

    if density_summary:
        system_text += f"\n\nCurrent crowd conditions:\n{density_summary}"

    system_text += f"\n\nStadium knowledge base (use this to answer):\n{context_text}"

    # ── 5. Generate answer ────────────────────────────────────────────────
    sources = _docs_to_sources(docs)
    llm_used = False

    if llm is not None:
        try:
            messages = [
                SystemMessage(content=system_text),
                HumanMessage(content=query),
            ]
            response = await llm.ainvoke(messages)
            answer = response.content
            llm_used = True
        except Exception as exc:
            print(f"   WARNING: Gemini LLM error: {exc}")
            answer = (
                _NO_KEY_WARNING.get(language, _NO_KEY_WARNING["en"])
                + "\n\n"
                + _fallback_synthesis(query, context_text, language)
            )
    else:
        answer = (
            _NO_KEY_WARNING.get(language, _NO_KEY_WARNING["en"])
            + "\n\n"
            + _fallback_synthesis(query, context_text, language)
        )

    return {
        "answer": answer,
        "sources": sources,
        "llm_used": llm_used,
        "language": language,
        "fan_location": {
            "gate": fan_gate,
            "section": fan_section,
            "geolocation": geolocation,
        },
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def _docs_to_sources(docs: list[Document]) -> list[dict]:
    return [
        {
            "type":  d.metadata.get("type"),
            "id":    d.metadata.get("id"),
            "name":  d.metadata.get("name"),
            "text":  d.page_content,
            "score": d.metadata.get("retrieval_score"),
        }
        for d in docs
    ]


def _fallback_synthesis(query: str, context: str, language: str) -> str:
    """
    Keyword-ranked deterministic synthesis used when Gemini LLM is unavailable.
    Extracts the most relevant lines from retrieved context.
    """
    lines = [ln.strip() for ln in context.split("\n") if ln.strip()]
    keywords = query.lower().split()

    ranked = sorted(
        [
            (sum(1 for kw in keywords if kw in ln.lower()), ln)
            for ln in lines
        ],
        key=lambda x: -x[0],
    )
    top = [ln for score, ln in ranked[:3] if score > 0]

    intro = _FALLBACK_INTRO.get(language, _FALLBACK_INTRO["en"])
    if top:
        return intro + "\n".join(f"• {ln}" for ln in top)
    return _FALLBACK_NOT_FOUND.get(language, _FALLBACK_NOT_FOUND["en"])

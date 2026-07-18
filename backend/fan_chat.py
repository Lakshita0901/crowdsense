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

Multi-source reasoning (v3):
  The LLM receives THREE independent context blocks and is explicitly
  instructed to cross-reference them before generating a route:
    1. FAISS / floorplan — spatial layout, what is where
    2. Live gate density  — per-gate congestion right now
    3. Match clock        — event phase, surge prediction
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

import numpy as np
from langdetect import detect, DetectorFactory
from langdetect.lang_detect_exception import LangDetectException
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

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

_LANG_ALIASES: dict[str, str] = {
    "ca": "es",   "gl": "es",   "oc": "fr",
    "br": "pt",   "en-us": "en", "en-gb": "en",
}

# Gate adjacency map — used for rerouting suggestions
_GATE_ORDER = ["GATE_A", "GATE_B", "GATE_C", "GATE_D",
               "GATE_E", "GATE_F", "GATE_G", "GATE_H"]

def _adjacent_gates(gate_id: str) -> list[str]:
    """
    Return the two gates adjacent to gate_id in ring order.

    Args:
        gate_id (str): The ID of the primary gate.

    Returns:
        list[str]: A list of adjacent gate IDs (exactly two elements).
    """
    if gate_id not in _GATE_ORDER:
        return []
    idx = _GATE_ORDER.index(gate_id)
    n = len(_GATE_ORDER)
    return [_GATE_ORDER[(idx - 1) % n], _GATE_ORDER[(idx + 1) % n]]


def calculate_decayed_load(initial_load: float, time_elapsed: float, decay_rate: float = 0.05) -> float:
    """
    Calculate the decayed load over simulated time.
    Models how crowd congestion at a gate naturally disperses as time passes.

    Args:
        initial_load (float): The initial crowd count or occupancy load percentage.
        time_elapsed (float): Time in minutes elapsed since the last observation.
        decay_rate (float): The rate of crowd dispersion. Defaults to 0.05.

    Returns:
        float: The newly computed decayed load value.
    """
    import math
    return max(0.0, initial_load * math.exp(-decay_rate * time_elapsed))


# ── Multilingual system prompts ────────────────────────────────────────────────
_ROUTING_INSTRUCTION_EN = (
    "\n\nCROSS-SYSTEM REASONING RULES (follow these before answering every navigation or recommendation question):\n"
    "1. Identify the gate(s) that serve the fan's destination section.\n"
    "2. Look up EACH of those gates in the Live Gate Density table.\n"
    "3. If any serving gate is 'critical' (90%+) or 'high' (75%+), do NOT route the fan there.\n"
    "   Instead recommend the next-lowest-congestion adjacent gate and explain why.\n"
    "4. If the match clock shows a surge is imminent (half-time, final whistle within ~5 min),\n"
    "   proactively warn the fan and suggest moving early or waiting.\n"
    "5. Always state the current wait time for the gate you recommend.\n"
    "6. If no density data is available, give the standard route but note that live data is unavailable.\n"
    "7. Whenever you suggest a route or recommend a gate/destination, you MUST append a short, separate paragraph starting with 'Why: ' at the very bottom of your response (e.g., 'Why: Gate A is at 94% capacity right now, so I\'m routing you through Gate H instead, which has almost no wait.'). This line must explain the reasoning using the actual occupancy percentages and wait times from the live data. Keep it conversational, short, and not technical.\n"
    "8. Keep the whole answer under 150 words — fans are on their feet."
)

_ROUTING_INSTRUCTION_ES = (
    "\n\nREGLAS DE RAZONAMIENTO CRUZADO (sigue estas antes de responder cualquier pregunta de navegación o recomendación):\n"
    "1. Identifica las puertas que sirven a la sección de destino del fanático.\n"
    "2. Consulta CADA una de esas puertas en la tabla de densidad en vivo.\n"
    "3. Si una puerta es 'crítica' (90%+) o 'alta' (75%+), NO dirijas al fanático allí.\n"
    "   Recomienda la puerta adyacente con menor congestión y explica por qué.\n"
    "4. Si el reloj del partido indica una oleada inminente, avisa al fanático.\n"
    "5. Siempre indica el tiempo de espera actual de la puerta recomendada.\n"
    "6. Siempre que sugieras una ruta o recomiendes una puerta/destino, DEBES añadir al final un párrafo corto y separado que empiece con 'Why: ' explicando el motivo con los datos reales de ocupación y tiempo de espera (ej. 'Why: Gate A está al 94% de capacidad ahora mismo, por lo que te dirijo a Gate H que casi no tiene espera.'). Manténlo conversacional, corto y no técnico.\n"
    "7. Mantén la respuesta en menos de 150 palabras."
)

_ROUTING_INSTRUCTION_PT = (
    "\n\nREGRAS DE RACIOCÍNIO CRUZADO (siga antes de responder qualquer pergunta de navegação ou recomendação):\n"
    "1. Identifique os portões que atendem à seção de destino do torcedor.\n"
    "2. Consulte CADA portão na tabela de densidade ao vivo.\n"
    "3. Se algum portão estiver 'crítico' (90%+) ou 'alto' (75%+), NÃO encaminhe o torcedor.\n"
    "   Recomende o portão adjacente menos congestionado e explique o motivo.\n"
    "4. Se o relógio do jogo indicar uma onda iminente, avise o torcedor.\n"
    "5. Sempre informe o tempo de espera atual do portão recomendado.\n"
    "6. Sempre que sugerir uma rota ou recomendar um portão/destino, você DEVE adicionar no final um parágrafo curto e separado que comece com 'Why: ' explicando o motivo com os dados reais de ocupação e tempo de espera (ex. 'Why: Gate A está com 94% de capacidade agora, então estou direcionando você para o Gate H, que quase não tem espera.'). Mantenha-o conversacional, curto e não técnico.\n"
    "7. Mantenha a resposta em menos de 150 palavras."
)

_ROUTING_INSTRUCTION_DE = (
    "\n\nKREUZSYSTEM-REGELN (vor jeder Navigations- oder Empfehlungsantwort befolgen):\n"
    "1. Identifiziere die Tore, die den Zielbereich des Fans bedienen.\n"
    "2. Prüfe JEDES dieser Tore in der Live-Dichtetabelle.\n"
    "3. Bei 'kritisch' (90%+) oder 'hoch' (75%+) dieses Tor NICHT empfehlen.\n"
    "   Empfehle stattdessen das am wenigsten überfüllte Nachbartor und erkläre warum.\n"
    "4. Bei drohendem Ansturm (Halbzeit, Spielende) Fans proaktiv warnen.\n"
    "5. Immer die aktuelle Wartezeit des empfohlenen Tors angeben.\n"
    "6. Wann immer Sie eine Route vorschlagen oder ein Tor/Ziel empfehlen, MÜSSEN Sie am Ende einen kurzen, separaten Absatz hinzufügen, der mit 'Why: ' beginnt und die Begründung mit realen Belegungs- und Wartezeitdaten erklärt (z. B. 'Why: Gate A ist derzeit zu 94% ausgelastet, daher leite ich Sie über Gate H um, das fast keine Wartezeit hat.'). Halten Sie es umgangssprachlich, kurz und nicht technisch.\n"
    "7. Antwort unter 150 Wörter halten."
)

_ROUTING_INSTRUCTION_FR = (
    "\n\nRÈGLES DE RAISONNEMENT CROISÉ (à suivre avant chaque réponse de navigation ou recommandation):\n"
    "1. Identifie les portes desservant la section de destination du supporter.\n"
    "2. Vérifie CHAQUE porte dans le tableau de densité en direct.\n"
    "3. Si une porte est 'critique' (90%+) ou 'haute' (75%+), n'y dirige PAS le supporter.\n"
    "   Recommande la porte adjacente la moins encombrée en expliquant pourquoi.\n"
    "4. Si l'horloge du match indique une affluence imminente, préviens le supporter.\n"
    "5. Indique toujours le temps d'attente actuel de la porte recommandée.\n"
    "6. Chaque fois que vous suggérez un itinéraire ou recommandez une porte/destination, vous DEVEZ ajouter à la toute fin un court paragraphe distinct commençant par 'Why: ' expliquant la raison avec les données réelles d'occupation et de temps d'attente (ex. 'Why: Gate A est à 94% de capacité actuellement, je vous dirige donc vers Gate H qui n'a presque pas d'attente.'). Restez conversationnel, court et non technique.\n"
    "7. Réponds en moins de 150 mots."
)

SYSTEM_PROMPTS: dict[str, str] = {
    "en": (
        "You are CrowdSense AI, a warm, knowledgeable FIFA World Cup 2026 stadium assistant "
        "at MetLife Stadium, East Rutherford, NJ (capacity 60,000 seats). "
        "Your job is to help fans navigate the stadium: find restrooms, food courts, medical stations, "
        "accessible entries, and gates quickly and clearly. "
        "Always respond in natural, friendly English using a warm, welcoming register appropriate for international visitors. "
        "Be concise — fans are on their feet. "
        "If the fan has shared their gate or section, tailor your directions from that location. "
        "Ground every answer in the three data sources provided below. "
        "Important: You have access to a live interactive Stadium Map. Whenever a fan asks for directions, routes, or visual locations, tell them they can click the 'View on Map' button directly below your response to view the live highlighted route on the map. Never say 'I cannot display a map' or similar limitations."
        + _ROUTING_INSTRUCTION_EN
    ),
    "es": (
        "Eres CrowdSense AI, un asistente de estadio amable y experto para la Copa Mundial FIFA 2026 "
        "en el MetLife Stadium, East Rutherford, NJ (capacidad 60.000 asientos). "
        "Tu misión es ayudar a los fanáticos a navegar el estadio de forma rápida y clara. "
        "Usa siempre un registro y tono sumamente cálido, respetuoso y formal (tratamiento de 'usted' en lugar de 'tú') adecuado para turistas y visitantes internacionales, no locales. "
        "Ajusta la calidez del fraseo apropiadamente para la cultura hispanohablante. Responde siempre en español natural. Sé conciso — los fanáticos están de pie. "
        "Importante: Tienes acceso a un mapa interactivo del estadio. Cuando un fanático solicite direcciones o rutas visuales, indícale que puede hacer clic en el botón 'View on Map' (Ver en mapa) que aparece debajo de tu respuesta para ver la ruta resaltada en vivo. Nunca digas 'no puedo mostrar un mapa' o limitaciones similares."
        + _ROUTING_INSTRUCTION_ES
    ),
    "pt": (
        "Você é CrowdSense AI, um assistente de estádio caloroso para a Copa do Mundo FIFA 2026 "
        "no MetLife Stadium, East Rutherford, NJ (capacidade 60.000 lugares). "
        "Sua missão é ajudar os torcedores a navegar pelo estádio de forma rápida e clara. "
        "Use sempre um tom extremamente acolhedor, respeitoso e formal (tratamiento de 'você' ou 'o senhor/a senhora' em vez de 'tu') apropriado para torcedores que são visitantes internacionais e turistas, não moradores locais. "
        "Responda sempre em português natural e acolhedor. Seja conciso. "
        "Importante: Você tem acesso a um mapa interativo do estádio. Sempre que um torcedor pedir direções ou rotas visuais, informe que ele pode clicar no botão 'View on Map' logo abaixo de sua resposta para ver a rota destacada. Nunca diga 'não posso exibir um mapa' ou limitações parecidas."
        + _ROUTING_INSTRUCTION_PT
    ),
    "de": (
        "Du bist CrowdSense AI, ein freundlicher Stadionassistent für die FIFA WM 2026 "
        "im MetLife Stadium, East Rutherford, NJ (60.000 Plätze). "
        "Deine Aufgabe ist es, Fans schnell und verständlich durch das Stadion zu führen. "
        "Verwende immer eine höfliche, respektvolle und formelle Ansprache (Verwendung von 'Sie' statt 'du'), da die Fans internationale Besucher und Touristen und keine Einheimischen sind. "
        "Antworte immer auf natürlichem, freundlichem Deutsch. Sei präzise. "
        "Wichtig: Sie haben Zugriff auf einen interaktiven Stadionplan. Wenn ein Fan nach Wegbeschreibungen oder visuellen Routen fragt, weisen Sie darauf hin, dass er auf die Schaltfläche 'View on Map' direkt unter Ihrer Antwort klicken kann, um die Live-Route auf dem Plan zu sehen. Sagen Sie niemals 'Ich kann keinen Plan anzeigen' oder ähnliche Einschränkungen."
        + _ROUTING_INSTRUCTION_DE
    ),
    "fr": (
        "Tu es CrowdSense AI, un assistant de stade chaleureux pour la Coupe du Monde FIFA 2026 "
        "au MetLife Stadium, East Rutherford, NJ (60 000 places). "
        "Ta mission est d'aider les supporters à naviguer dans le stade rapidement et clairement. "
        "Utilisez toujours un registre et un ton chaleureux, respectueux et formel (vouvoiement 'vous' au lieu de tutoiement 'tu') car les supporters sont des visiteurs et des touristes internationaux, pas des locaux. "
        "Réponds toujours en français naturel et chaleureux. Sois concis. "
        "Important : Vous avez accès à un plan de stade interactif en direct. Lorsqu'un supporter demande des directions ou un itinéraire visuel, expliquez-lui qu'il peut cliquer sur le bouton 'View on Map' situé sous votre réponse pour afficher l'itinéraire en surbrillance. Ne dites jamais 'je ne peux pas afficher de plan' ou d'autres limitations."
        + _ROUTING_INSTRUCTION_FR
    ),
}

# ── Fallback strings (no LLM key) ─────────────────────────────────────────────

_FALLBACK_INTRO: dict[str, str] = {
    "en": "Based on the stadium information I have:\n\n",
    "es": "Según la información del estadio que tengo:\n\n",
    "pt": "Com base nas informações do estádio que tenho:\n\n",
    "de": "Basierend auf den Stadioninformationen, die ich habe:\n\n",
    "fr": "D'après les informations du stade que j'ai:\n\n",
}

_FALLBACK_NOT_FOUND: dict[str, str] = {
    "en": "I don't have enough information to answer that precisely. Please ask a stadium staff member.",
    "es": "No tengo suficiente información. Por favor, pida ayuda al personal del estadio.",
    "pt": "Não tenho informações suficientes. Por favor, peça ajuda à equipe do estádio.",
    "de": "Nicht genug Informationen. Bitte fragen Sie das Stadionpersonal.",
    "fr": "Pas assez d'informations. Veuillez demander au personnel du stade.",
}

_NO_KEY_WARNING: dict[str, str] = {
    "en": "⚠️ AI generation unavailable (no GOOGLE_API_KEY configured). Showing retrieved information only.",
    "es": "⚠️ Generación de IA no disponible (sin GOOGLE_API_KEY). Mostrando solo información recuperada.",
    "pt": "⚠️ Geração de IA indisponível (sem GOOGLE_API_KEY). Exibindo apenas informações recuperadas.",
    "de": "⚠️ KI-Generierung nicht verfügbar (kein GOOGLE_API_KEY konfiguriert). Nur abgerufene Informationen.",
    "fr": "⚠️ Génération IA indisponible (aucun GOOGLE_API_KEY). Informations récupérées uniquement.",
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
    embed_model: any,
    faiss_index: any,
    faiss_meta: dict,
    k: int = 5,
    history: Optional[list[any]] = None,
) -> list[Document]:
    """
    Search index using FAISS if available, or fall back to keyword-based relevance matching
    over the chunk metadata list. Wraps results as LangChain Documents.
    Applies active dietary tag post-filtering if the query requests specific dietary restrictions.
    Expands the search query using history to handle follow-up indexical references.

    Args:
        query (str): Search query string.
        embed_model (any): Unused — kept for backwards-compatible call signature.
                           Embedding is now done via the Gemini API (embed_single in indexer.py).
        faiss_index (any): FAISS index instance or None.
        faiss_meta (dict): Dictionary with floorplan text chunks and matching metadata records.
        k (int): Number of context chunks to retrieve. Defaults to 5.
        history (Optional[list[any]]): Conversation history messages to retain context.

    Returns:
        list[Document]: List of LangChain Document objects containing relevant context.
    """
    chunks: list[str] = faiss_meta.get("chunks", [])
    metas: list[dict] = faiss_meta.get("metadata", [])

    # Query expansion using conversation history
    retrieval_query = query
    if history:
        last_user_msgs = []
        for h in history:
            h_role = h.role if hasattr(h, "role") else h.get("role", "")
            h_text = h.text if hasattr(h, "text") else h.get("text", "")
            if h_role == "user" and h_text:
                last_user_msgs.append(h_text)
        if last_user_msgs:
            retrieval_query = f"{last_user_msgs[-1]} {query}"

    # Detect active dietary tag filters in the query
    dietary_tags = ["vegan", "gluten-free", "halal", "vegetarian", "dairy-free"]
    query_lower = retrieval_query.lower()
    active_tags = []
    for tag in dietary_tags:
        normalized_tag = tag.replace("-", " ")
        if tag in query_lower or normalized_tag in query_lower:
            active_tags.append(tag)

    if faiss_index is None:
        # Keyword-based fallback search
        keywords = retrieval_query.lower().split()
        ranked = []
        for idx, (chunk, meta) in enumerate(zip(chunks, metas)):
            # If query mentions a dietary tag, and this is a food court, but doesn't have the tag, skip it
            if active_tags and meta.get("type") == "food_court":
                doc_tags = meta.get("dietary", [])
                if not all(t in doc_tags for t in active_tags):
                    continue

            score = sum(2 if kw in chunk.lower() else 0 for kw in keywords)
            if score > 0:
                ranked.append((score, idx, chunk, meta))
        
        ranked.sort(key=lambda x: -x[0])
        docs: list[Document] = []
        for score, idx, chunk, meta in ranked[:k]:
            docs.append(
                Document(
                    page_content=chunk,
                    metadata={**meta, "retrieval_score": float(score)},
                )
            )
        # If no keywords matched, return the first few chunks as fallback context
        if not docs and chunks:
            for idx in range(min(k, len(chunks))):
                meta = metas[idx]
                if active_tags and meta.get("type") == "food_court":
                    doc_tags = meta.get("dietary", [])
                    if not all(t in doc_tags for t in active_tags):
                        continue
                docs.append(
                    Document(
                        page_content=chunks[idx],
                        metadata={**meta, "retrieval_score": 0.0},
                    )
                )
        return docs

    try:
        from indexer import embed_single  # noqa: PLC0415
        q_vec = embed_single(retrieval_query)
    except Exception as _embed_err:
        print(f"[CrowdSense] Gemini embed failed ({_embed_err}), falling back to keyword search.")
        # Keyword fallback — re-use the same logic already above
        keywords = retrieval_query.lower().split()
        ranked = []
        for idx, (chunk, meta) in enumerate(zip(chunks, metas)):
            if active_tags and meta.get("type") == "food_court":
                doc_tags = meta.get("dietary", [])
                if not all(t in doc_tags for t in active_tags):
                    continue
            score = sum(2 if kw in chunk.lower() else 0 for kw in keywords)
            if score > 0:
                ranked.append((score, idx, chunk, meta))
        ranked.sort(key=lambda x: -x[0])
        docs: list[Document] = []
        for score, idx, chunk, meta in ranked[:k]:
            docs.append(
                Document(
                    page_content=chunk,
                    metadata={**meta, "retrieval_score": float(score)},
                )
            )
        return docs

    # Search for more matches to ensure we have enough post-filtered results if dietary filters are active
    search_k = max(20, k * 3) if active_tags else k
    distances, indices = faiss_index.search(q_vec, search_k)

    docs: list[Document] = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < 0:
            continue
        meta = metas[idx]

        # If query mentions a dietary tag, and this is a food court, but doesn't have the tag, skip it
        if active_tags and meta.get("type") == "food_court":
            doc_tags = meta.get("dietary", [])
            if not all(t in doc_tags for t in active_tags):
                continue

        docs.append(
            Document(
                page_content=chunks[idx],
                metadata={**meta, "retrieval_score": float(dist)},
            )
        )
        if len(docs) >= k:
            break
    return docs


# ── LLM builder ────────────────────────────────────────────────────────────────

def build_gemini_llm() -> Optional[any]:
    """
    Instantiate ChatGoogleGenerativeAI (gemini-2.5-flash) if GOOGLE_API_KEY is set.
    Returns None on missing key or import error — triggers graceful fallback.

    Returns:
        Optional[any]: ChatGoogleGenerativeAI instance if successful, else None.
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


# ── Data source 2: Live gate density table ────────────────────────────────────

def build_live_gate_table(density: dict) -> str:
    """
    Build a structured, LLM-readable table of every gate's current status.
    This is richer than the old summary — the LLM sees per-gate data so it
    can reason about specific routes, not just overall crowding.
    """
    if not density:
        return "Live gate density data: UNAVAILABLE"

    gates = density.get("gates", [])
    totals = density.get("stadium_totals", {})
    meta = density.get("meta", {})
    match_label = meta.get("match", "Match in progress")

    lines = [
        f"=== LIVE GATE DENSITY — {match_label} ===",
        f"Stadium: {totals.get('occupancy_pct', 0):.1f}% full "
        f"({totals.get('total_present', 0):,} / {totals.get('total_capacity', 60000):,} fans)\n",
        f"{'Gate':<8} {'Status':<10} {'Load':<7} {'Wait':<10} {'Trend':<10} {'Action'}",
        "-" * 70,
    ]

    for g in gates:
        status = g.get("status", "unknown").upper()
        pct    = g.get("pct", 0)
        wait   = g.get("avg_wait_minutes", 0)
        trend  = g.get("trend", "")
        name   = g.get("gate_name", g.get("gate_id", "?"))
        alert  = g.get("alert") or ""

        # Build a clear action hint for the LLM to leverage
        if status == "CRITICAL":
            action = f"AVOID — {alert}" if alert else "AVOID — redirect to adjacent gate"
        elif status == "HIGH":
            action = "Caution — long queue expected"
        elif status == "MODERATE":
            action = "Acceptable — moderate wait"
        else:
            action = "Clear — recommend this route"

        trend_arrow = {"rising": "↑ rising", "falling": "↓ falling", "stable": "→ stable"}.get(trend, trend)
        lines.append(f"{name:<8} {status:<10} {pct:>5.1f}%  ~{wait:>2} min     {trend_arrow:<12} {action}")

    # Highlight best and worst gates explicitly so the LLM can directly name them
    if gates:
        sorted_gates = sorted(gates, key=lambda g: g.get("pct", 0))
        best  = sorted_gates[0]
        worst = sorted_gates[-1]
        lines.append("")
        lines.append(
            f"BEST route right now: {best['gate_name']} "
            f"({best.get('pct', 0):.0f}% load, ~{best.get('avg_wait_minutes', 0)} min wait)"
        )
        lines.append(
            f"WORST congestion: {worst['gate_name']} "
            f"({worst.get('pct', 0):.0f}% load, ~{worst.get('avg_wait_minutes', 0)} min wait)"
        )

    return "\n".join(lines)


# ── Data source 3: Match clock context ───────────────────────────────────────

def build_match_clock_context(density: dict) -> str:
    """
    Derive the current match phase and predict crowd surges.

    Phase logic (FIFA 90-min match + half-time):
      Pre-match        : fans still arriving, gates filling
      First half       : stable inside, gates quiet
      Half-time surge  : ~45 min mark — fans pour into concourse
      Second half      : stable again
      Final whistle    : mass exit surge, worst congestion of the day
      Post-match       : dispersing, crowding slowly eases

    We derive phase from the kickoff timestamp in density.meta.
    Falls back to a generic message if timestamps are missing.
    """
    meta = density.get("meta", {}) if density else {}
    match_label = meta.get("match", "FIFA World Cup 2026 match")
    kickoff_str = meta.get("kickoff", "")
    match_date  = meta.get("match_date", "")
    tz_label    = meta.get("timezone", "local time")

    lines = [f"=== MATCH CLOCK — {match_label} ==="]

    if not kickoff_str or not match_date:
        lines.append("Match timing data unavailable — no surge prediction possible.")
        lines.append("Treat all gate data at face value.")
        return "\n".join(lines)

    try:
        # Build kickoff as UTC-naive offset for comparison
        kickoff_naive = datetime.strptime(f"{match_date} {kickoff_str}", "%Y-%m-%d %H:%M")
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

        # Approximate: MetLife is UTC-4 (EDT) during summer
        # Offset now to local time for comparison with kickoff (stored in local time)
        utc_offset_hours = -4
        now_local = now_utc.replace(hour=(now_utc.hour + utc_offset_hours) % 24)
        elapsed_minutes = (now_local - kickoff_naive).total_seconds() / 60

        lines.append(f"Kickoff: {match_date} {kickoff_str} ({tz_label})")
        lines.append(f"Elapsed since kickoff: ~{int(elapsed_minutes)} min\n")

        if elapsed_minutes < -60:
            phase = "pre-match (gates opening, fans arriving — moderate crowding building)"
            surge = "Surge expected at kickoff. Recommend arriving at least 45 min early."
        elif elapsed_minutes < 0:
            phase = "pre-match / final approach (majority of fans arriving now)"
            surge = "IMMINENT surge — gates filling fast. Use least-congested gate immediately."
        elif elapsed_minutes < 44:
            phase = "first half in progress"
            surge = "Concourses quiet. Good time to visit restrooms or food courts."
        elif elapsed_minutes < 48:
            phase = "HALF-TIME (crowd surge in progress)"
            surge = (
                "HALF-TIME SURGE ACTIVE — concourses and gate queues are surging right now. "
                "Expect 2-3x normal wait times at all gates. "
                "If leaving or re-entering, use the least-congested gate."
            )
        elif elapsed_minutes < 90:
            phase = "second half in progress"
            remaining = max(0, 90 - int(elapsed_minutes))
            if remaining <= 10:
                surge = (
                    f"FINAL WHISTLE in ~{remaining} min — mass exit surge imminent. "
                    "Recommend moving to exits 5-10 min early to avoid the crush."
                )
            else:
                surge = f"Approx. {remaining} min remaining. Concourses moderately busy."
        elif elapsed_minutes < 120:
            phase = "post-match / mass exit"
            surge = (
                "POST-MATCH SURGE ACTIVE — all exit gates will be at maximum load. "
                "Stay seated for 10-15 min if possible, or use Gate H (Northwest) which historically disperses fastest."
            )
        else:
            phase = "post-match (dispersing)"
            surge = "Crowd has begun dispersing. Gate queues should be easing."

        lines.append(f"Match phase: {phase}")
        lines.append(f"Surge advisory: {surge}")

    except Exception as exc:
        lines.append(f"Could not parse match timing ({exc}). Using live gate data only.")

    return "\n".join(lines)


# ── Backward-compatible density summary (used by /api/ask) ───────────────────

def build_density_summary(density: dict) -> str:
    """Legacy one-line summary used by the ops /api/ask endpoint."""
    if not density:
        return ""
    gates = density.get("gates", [])
    totals = density.get("stadium_totals", {})

    lines = [
        f"Stadium occupancy: {totals.get('occupancy_pct', 0):.1f}% "
        f"({totals.get('total_present', 0):,} fans present out of {totals.get('total_capacity', 60000):,}).",
    ]
    critical = [g for g in gates if g.get("status") == "critical"]
    high     = [g for g in gates if g.get("status") == "high"]
    if critical:
        lines.append(f"CRITICAL overcrowding at: {', '.join(g['gate_name'] for g in critical)}")
    if high:
        lines.append(f"High density at: {', '.join(g['gate_name'] for g in high)}")
    if gates:
        least = min(gates, key=lambda g: g.get("pct", 100))
        lines.append(
            f"Least crowded: {least['gate_name']} "
            f"({least.get('pct', 0):.0f}%, ~{least.get('avg_wait_minutes', 0)} min wait)."
        )
    return "\n".join(lines)


# ── Core async fan chat function ───────────────────────────────────────────────

async def fan_chat(
    query: str,
    language: str,
    fan_gate: Optional[str],
    fan_section: Optional[str],
    geolocation: Optional[dict],
    density_raw: dict,
    embed_model: any,
    faiss_index: any,
    faiss_meta: dict,
    llm: any,
    floorplan: Optional[dict] = None,
    k: int = 5,
    history: Optional[list[any]] = None,
) -> dict:
    """
    Full multi-source RAG pipeline:
    1. Validate language
    2. Retrieve top-k relevant chunks from FAISS → LangChain Documents
    3. Build three independent context blocks:
         a) Floorplan / FAISS knowledge (where things are)
         b) Live gate density table (how crowded routes are right now)
         c) Match clock + surge prediction (when crowds will peak)
    4. Cross-reference fan's section with the live density of its primary gate —
       pre-select an alternative gate if the primary is congested
    5. Call Gemini via LangChain (async ainvoke) — or deterministic fallback

    Args:
        query (str): The fan's natural-language question.
        language (str): Chosen or detected language code ('en'|'es'|'pt'|'de'|'fr').
        fan_gate (Optional[str]): Gate from ticket selection (e.g. 'GATE_C').
        fan_section (Optional[str]): Section from ticket (e.g. 'SEC_107').
        geolocation (Optional[dict]): Geolocation lat/lng dictionary.
        density_raw (dict): Raw crowd density snapshot.
        embed_model (any): SentenceTransformer model instance or None.
        faiss_index (any): FAISS index instance or None.
        faiss_meta (dict): Dictionary with chunk texts and metadata.
        llm (any): LangChain ChatGoogleGenerativeAI instance or None.
        floorplan (Optional[dict]): Stadium floorplan metadata or None.
        k (int): Number of context chunks to retrieve. Defaults to 5.
        history (Optional[list[any]]): Conversation history messages to retain context.

    Returns:
        dict: Response containing answer, explainability why block, sources, and metadata flags.
    """

    # ── 1. Validate / normalise language ──────────────────────────────────
    if language not in SUPPORTED_LANGUAGES:
        language = "en"

    # ── 2. Retrieve floorplan context from FAISS ──────────────────────────
    docs = retrieve_docs(query, embed_model, faiss_index, faiss_meta, k, history)
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
            loc_parts.append(f"GPS ({float(lat):.4f}, {float(lng):.4f})")
    fan_location_str = ", ".join(loc_parts) if loc_parts else None

    # ── 4. Cross-reference: fan's section → primary gate → density ────────
    #
    # This is the key multi-source reasoning step: we look up the fan's
    # section in the floorplan to find its primary gate, then check that
    # gate's live density. If it's congested we pre-build an advisory for
    # the LLM so it has the cross-reference explicit in its context.
    cross_ref_note = ""
    if floorplan and fan_section:
        sections = floorplan.get("sections", [])
        this_sec = next((s for s in sections if s["id"] == fan_section), None)
        if this_sec:
            primary_gate = this_sec.get("primary_gate", "")
            density_gates = density_raw.get("gates", [])
            gate_data = next((g for g in density_gates if g["gate_id"] == primary_gate), None)
            if gate_data:
                pct    = gate_data.get("pct", 0)
                status = gate_data.get("status", "low")
                wait   = gate_data.get("avg_wait_minutes", 0)
                gname  = gate_data.get("gate_name", primary_gate)
                if status in ("critical", "high"):
                    # Find best alternative from adjacent gates
                    adj_ids = _adjacent_gates(primary_gate)
                    adj_data = [
                        g for g in density_gates if g["gate_id"] in adj_ids
                    ]
                    adj_data.sort(key=lambda g: g.get("pct", 100))
                    if adj_data:
                        alt = adj_data[0]
                        cross_ref_note = (
                            f"\n\n=== ROUTING ALERT (pre-computed cross-reference) ===\n"
                            f"The fan's section {fan_section.replace('SEC_', '')} is normally served by "
                            f"{gname} — but {gname} is currently at {pct:.0f}% capacity "
                            f"(status: {status.upper()}, wait: ~{wait} min).\n"
                            f"RECOMMENDED ALTERNATIVE: {alt['gate_name']} "
                            f"({alt.get('pct', 0):.0f}% load, ~{alt.get('avg_wait_minutes', 0)} min wait).\n"
                            f"Your answer MUST reroute the fan via {alt['gate_name']} and explain why."
                        )
                    else:
                        cross_ref_note = (
                            f"\n\n=== ROUTING ALERT ===\n"
                            f"Section {fan_section.replace('SEC_', '')} normally uses {gname}, "
                            f"which is at {pct:.0f}% (status: {status.upper()}). "
                            f"Advise the fan to check adjacent gates."
                        )

    # ── 5. Assemble multi-source system prompt ────────────────────────────
    system_text = SYSTEM_PROMPTS.get(language, SYSTEM_PROMPTS["en"])

    if fan_location_str:
        system_text += f"\n\nFan's current location: {fan_location_str}."

    # Source block A: FAISS / floorplan
    system_text += f"\n\n{'='*60}\nSOURCE A — STADIUM FLOORPLAN (where things are)\n{'='*60}\n{context_text}"

    # Source block B: Live gate density
    gate_table = build_live_gate_table(density_raw)
    system_text += f"\n\n{'='*60}\nSOURCE B — LIVE GATE DENSITY (right now)\n{'='*60}\n{gate_table}"

    # Source block C: Match clock / surge prediction
    match_ctx = build_match_clock_context(density_raw)
    system_text += f"\n\n{'='*60}\nSOURCE C — MATCH CLOCK & SURGE PREDICTION\n{'='*60}\n{match_ctx}"

    # Pre-computed cross-reference (if congestion detected above)
    if cross_ref_note:
        system_text += cross_ref_note

    # ── 6. Generate answer ────────────────────────────────────────────────
    sources = _docs_to_sources(docs)
    llm_used = False

    if llm is not None:
        try:
            messages = [SystemMessage(content=system_text)]
            if history:
                # Keep the last 6 messages (3 user turns, 3 AI turns) for optimal context
                recent_history = history[-6:]
                for h in recent_history:
                    h_role = h.role if hasattr(h, "role") else h.get("role", "")
                    h_text = h.text if hasattr(h, "text") else h.get("text", "")
                    if h_role == "user" and h_text:
                        messages.append(HumanMessage(content=h_text))
                    elif h_role in ("ai", "assistant") and h_text:
                        messages.append(AIMessage(content=h_text))
            messages.append(HumanMessage(content=query))

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

    answer, why_reason = extract_why_line(answer)

    # If no why_reason was extracted, but we had a pre-computed routing alert, build a fallback why_reason
    if not why_reason and cross_ref_note:
        if floorplan and fan_section:
            sections = floorplan.get("sections", [])
            this_sec = next((s for s in sections if s["id"] == fan_section), None)
            if this_sec:
                primary_gate = this_sec.get("primary_gate", "")
                density_gates = density_raw.get("gates", [])
                gate_data = next((g for g in density_gates if g["gate_id"] == primary_gate), None)
                if gate_data:
                    pct    = gate_data.get("pct", 0)
                    gname  = gate_data.get("gate_name", primary_gate)
                    status = gate_data.get("status", "low")
                    if status in ("critical", "high"):
                        adj_ids = _adjacent_gates(primary_gate)
                        adj_data = [g for g in density_gates if g["gate_id"] in adj_ids]
                        adj_data.sort(key=lambda g: g.get("pct", 100))
                        if adj_data:
                            alt = adj_data[0]
                            why_reason = _generate_fallback_why(gname, pct, alt['gate_name'], language)

    return {
        "answer": answer,
        "why": why_reason,
        "sources": sources,
        "llm_used": llm_used,
        "language": language,
        "fan_location": {
            "gate": fan_gate,
            "section": fan_section,
            "geolocation": geolocation,
        },
        "routing_alert": bool(cross_ref_note),
    }


# ── Internal helpers ───────────────────────────────────────────────────────────

def extract_why_line(answer: str) -> tuple[str, str]:
    """
    Looks for a line starting with "Why:" (case-insensitive) at the end of the answer.
    Returns (clean_answer, why_line_content).

    Args:
        answer (str): Raw generative AI response content.

    Returns:
        tuple[str, str]: Tuple of clean answer text (without "Why:" line) and the extracted explanation content.
    """
    lines = answer.split("\n")
    why_content = ""
    
    # We scan from the bottom to find the last line starting with "Why:"
    why_idx = -1
    for i in range(len(lines) - 1, -1, -1):
        trimmed = lines[i].strip()
        # Check if starts with "why:" (case-insensitive)
        if trimmed.lower().startswith("why:"):
            why_idx = i
            why_content = trimmed[4:].strip()
            break
        # Also check if it starts with "**why:**" or similar markdown bolding
        elif trimmed.lower().startswith("**why:**"):
            why_idx = i
            why_content = trimmed[8:].strip()
            break
            
    if why_idx != -1:
        # Reconstruct answer without the "Why:" line
        clean_lines = [lines[idx] for idx in range(len(lines)) if idx != why_idx]
        return "\n".join(clean_lines).strip(), why_content
    
    return answer, ""


def _generate_fallback_why(primary_gate_name: str, pct: float, alt_gate_name: str, language: str) -> str:
    """
    Generate a localized fallback explanation string.

    Args:
        primary_gate_name (str): Name of the congested primary gate.
        pct (float): Occupancy percentage of the primary gate.
        alt_gate_name (str): Name of the recommended alternative gate.
        language (str): Localized language code.

    Returns:
        str: Explainable routing explanation.
    """
    if language == "es":
        return f"{primary_gate_name} está al {pct:.0f}% de capacidad ahora mismo, por lo que te dirijo a {alt_gate_name} que casi no tiene espera."
    elif language == "pt":
        return f"{primary_gate_name} está com {pct:.0f}% de capacidade agora, então estou direcionando você para o {alt_gate_name}, que quase não tem espera."
    elif language == "de":
        return f"{primary_gate_name} ist derzeit zu {pct:.0f}% ausgelastet, daher leite ich Sie über {alt_gate_name} um, das fast keine Wartezeit hat."
    elif language == "fr":
        return f"{primary_gate_name} est à {pct:.0f}% de capacité actuellement, je vous dirige donc vers {alt_gate_name} qui n'a presque pas d'attente."
    return f"{primary_gate_name} is at {pct:.0f}% capacity right now, so I'm routing you through {alt_gate_name} instead, which has almost no wait."


def _docs_to_sources(docs: list[Document]) -> list[dict]:
    """
    Convert a list of LangChain Document objects to dictionary representations.

    Args:
        docs (list[Document]): List of documents.

    Returns:
        list[dict]: List of dictionaries containing source types, identifiers, names, texts and scores.
    """
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

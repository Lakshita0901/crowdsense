"""
main.py — CrowdSense AI FastAPI Backend
========================================
Endpoints:
  GET  /api/health                   System health + FAISS + Gemini status
  GET  /api/floorplan                Full stadium floor-plan JSON
  GET  /api/density                  Live crowd density snapshot
  POST /api/density/update           Simulate one density tick
  POST /api/ask                      Ops RAG (basic FAISS synthesis, no LLM)
  POST /api/fan/chat                 Multilingual fan assistant (Gemini RAG)
  POST /api/fan/detect-language      Language auto-detection

Start with:
    uvicorn main:app --reload --port 8000
"""

import json
import os
import pickle
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import faiss
except Exception as e:
    print(f"Warning: Failed to import faiss: {e}")
    faiss = None

import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Load .env before importing fan_chat (which reads GOOGLE_API_KEY)
load_dotenv()

from fan_chat import (  # noqa: E402
    build_gemini_llm,
    build_density_summary,
    build_live_gate_table,
    build_match_clock_context,
    detect_language,
    fan_chat as _fan_chat,
    LANGUAGE_NAMES,
    SUPPORTED_LANGUAGES,
)

# ── Paths ──────────────────────────────────────────────────────────────────
BASE_DIR       = Path(__file__).parent
FLOORPLAN_FILE = BASE_DIR / "data" / "stadium_floorplan.json"
DENSITY_FILE   = BASE_DIR / "data" / "crowd_density.json"
INDEX_FILE     = BASE_DIR / "faiss_index" / "stadium.index"
META_FILE      = BASE_DIR / "faiss_index" / "metadata.pkl"

TOP_K = 5

# ── App setup ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="CrowdSense AI",
    description="GenAI stadium operations assistant — FIFA World Cup 2026",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory state ────────────────────────────────────────────────────────
_floorplan:   dict = {}
_density:     dict = {}
_faiss_index        = None
_faiss_meta:  dict = {}
_gemini_llm         = None   # ChatGoogleGenerativeAI | None

# ── Rate Limiter ───────────────────────────────────────────────────────────
_rate_limit_records: dict[str, list[float]] = {}

def check_rate_limit(client_ip: str, limit: int = 15, window: int = 60) -> bool:
    """
    Check if a client has exceeded request limits.
    
    Args:
        client_ip (str): The IP address of the client.
        limit (int): Maximum requests allowed within the window.
        window (int): Time window in seconds.
        
    Returns:
        bool: True if request is allowed, False if rate-limited.
    """
    import time
    now = time.time()
    if client_ip not in _rate_limit_records:
        _rate_limit_records[client_ip] = [now]
        return True
    
    # Filter records within the window
    timestamps = [t for t in _rate_limit_records[client_ip] if now - t < window]
    if len(timestamps) >= limit:
        _rate_limit_records[client_ip] = timestamps
        return False
    
    timestamps.append(now)
    _rate_limit_records[client_ip] = timestamps
    return True

@app.on_event("startup")
async def startup() -> None:
    """
    FastAPI startup event handler. Loads floorplan and density data,
    initializes the FAISS index, and configures the Gemini LLM helper.
    """
    global _floorplan, _density, _faiss_index, _faiss_meta, _gemini_llm

    print("[CrowdSense AI] Loading stadium data...")
    with open(FLOORPLAN_FILE, encoding="utf-8") as fh:
        _floorplan = json.load(fh)
    with open(DENSITY_FILE, encoding="utf-8") as fh:
        _density = json.load(fh)

    if INDEX_FILE.exists() and META_FILE.exists():
        try:
            with open(META_FILE, "rb") as fh:
                _faiss_meta = fh.read()
                # Use raw bytes loading if pickle load succeeds later
                _faiss_meta = pickle.loads(_faiss_meta)
        except Exception as e:
            print(f"   Warning: Failed to load FAISS meta file: {e}")

        if faiss is not None:
            try:
                print("   Loading FAISS index...")
                _faiss_index = faiss.read_index(str(INDEX_FILE))
                print(f"   FAISS index loaded -- {_faiss_index.ntotal} vectors.")
            except Exception as e:
                print(f"   Warning: Failed to load FAISS index: {e}")
                _faiss_index = None

    else:
        print("   WARNING: FAISS index or metadata not found. Run `python indexer.py` first.")

    print("   Initialising Gemini LLM...")
    _gemini_llm = build_gemini_llm()
    if _gemini_llm:
        print("   OK: Gemini (gemini-2.5-flash) ready.")
    else:
        print("   WARNING: No GOOGLE_API_KEY -- fan chat will use FAISS-only fallback.")

    print("   OK: Startup complete.")


# ── Schemas ────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    query: str
    top_k: Optional[int] = TOP_K


class AskResponse(BaseModel):
    query: str
    answer: str
    sources: list[dict]


class ChatMessage(BaseModel):
    role: str
    text: str


class FanChatRequest(BaseModel):
    query: str
    language: str = "en"               # en | es | pt | de | fr
    fan_gate: Optional[str] = None     # e.g. "GATE_C"
    fan_section: Optional[str] = None  # e.g. "SEC_107"
    geolocation: Optional[dict] = None # {"lat": float, "lng": float} — outdoor placeholder
    top_k: Optional[int] = 5
    history: Optional[list[ChatMessage]] = None


class FanChatResponse(BaseModel):
    query: str
    answer: str
    why: Optional[str] = ""
    language: str
    sources: list[dict]
    fan_location: Optional[dict]
    llm_used: bool
    routing_alert: bool = False   # True when a density-triggered reroute was applied


class DetectLanguageRequest(BaseModel):
    text: str


class DetectLanguageResponse(BaseModel):
    language: str
    language_name: str


# ── Routes — System ────────────────────────────────────────────────────────

@app.get("/api/health", tags=["System"])
def health() -> dict:
    """
    Health check -- reports FAISS and Gemini status.

    Returns:
        dict: A mapping of system statuses, FAISS vectors loaded, and current time.
    """
    index_ready = _faiss_index is not None
    return {
        "status": "ok",
        "faiss_index_ready": index_ready,
        "vectors": _faiss_index.ntotal if index_ready else 0,
        "gemini_ready": _gemini_llm is not None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Routes — Stadium ───────────────────────────────────────────────────────

@app.get("/api/floorplan", tags=["Stadium"])
def get_floorplan() -> dict:
    """
    Return the full stadium floor-plan JSON.

    Returns:
        dict: The stadium floorplan layout data.
    
    Raises:
        HTTPException: If the floorplan dataset is not loaded.
    """
    if not _floorplan:
        raise HTTPException(status_code=503, detail="Floor-plan data not loaded.")
    return _floorplan


@app.get("/api/density", tags=["Crowd"])
def get_density() -> dict:
    """
    Return current per-gate crowd density snapshot.

    Returns:
        dict: Per-gate counts, queue wait times, and stadium total present count.

    Raises:
        HTTPException: If the crowd density dataset is not loaded.
    """
    if not _density:
        raise HTTPException(status_code=503, detail="Density data not loaded.")
    return _density


@app.post("/api/density/update", tags=["Crowd"])
def update_density() -> dict:
    """
    Simulate one density tick — each gate drifts ±3–8%.
    Updates congestion level statuses, wait times, and global stadium totals.

    Returns:
        dict: The updated crowd density mapping snapshot.
    """
    now = datetime.now(timezone.utc).isoformat()
    total = 0

    for gate in _density["gates"]:
        cap = gate["capacity"]
        drift = random.uniform(-0.05, 0.08)
        new_count = int(gate["current_count"] * (1 + drift))
        new_count = max(0, min(new_count, cap))
        pct = round((new_count / cap) * 100, 2)

        if pct >= 90:
            status = "critical"
        elif pct >= 75:
            status = "high"
        elif pct >= 40:
            status = "moderate"
        else:
            status = "low"

        diff = new_count - gate["current_count"]
        trend = "rising" if diff > 50 else ("falling" if diff < -50 else "stable")

        alert = None
        if status == "critical":
            neighbors = _nearest_gates(gate["gate_id"])
            alert = f"OVERCROWDING: Redirect fans to {neighbors}"

        gate["current_count"] = new_count
        gate["pct"] = pct
        gate["status"] = status
        gate["trend"] = trend
        gate["alert"] = alert
        gate["queue_length_meters"] = max(0, int((pct - 30) * 2))
        gate["avg_wait_minutes"] = max(0, int((pct - 30) / 10))
        gate["last_updated"] = now
        total += new_count

    _density["last_updated"] = now
    _density["stadium_totals"] = {
        "total_present": total,
        "total_capacity": 60000,
        "occupancy_pct": round((total / 60000) * 100, 2),
        "gates_at_critical": sum(1 for g in _density["gates"] if g["status"] == "critical"),
        "gates_at_high":     sum(1 for g in _density["gates"] if g["status"] == "high"),
    }
    return _density


def _nearest_gates(gate_id: str) -> str:
    """
    Find the two gates adjacent to the given gate_id in ring order.

    Args:
        gate_id (str): The ID of the gate (e.g., 'GATE_A').

    Returns:
        str: Description of the nearest alternative gates (e.g., 'Gate H or Gate B').
    """
    order = ["GATE_A", "GATE_B", "GATE_C", "GATE_D",
             "GATE_E", "GATE_F", "GATE_G", "GATE_H"]
    idx   = order.index(gate_id) if gate_id in order else 0
    prev_g = order[(idx - 1) % len(order)].replace("GATE_", "Gate ")
    next_g = order[(idx + 1) % len(order)].replace("GATE_", "Gate ")
    return f"{prev_g} or {next_g}"


# ── Routes — Ops RAG (no LLM) ─────────────────────────────────────────────

@app.post("/api/ask", response_model=AskResponse, tags=["Ops RAG"])
def ask(req: AskRequest) -> AskResponse:
    """
    Operations RAG endpoint — keyword-ranked FAISS synthesis, no LLM.
    For the fan-facing Claude response use /api/fan/chat instead.

    Args:
        req (AskRequest): Request payload containing user query and optional top_k.

    Returns:
        AskResponse: The synthesized text answer and matching source chunks.
    """
    if _faiss_index is None:
        chunks   = _faiss_meta.get("chunks", []) if _faiss_meta else []
        metadata = _faiss_meta.get("metadata", []) if _faiss_meta else []
        keywords = req.query.lower().split()
        
        ranked = []
        for idx, (chunk, meta) in enumerate(zip(chunks, metadata)):
            score = sum(1 for kw in keywords if kw in chunk.lower())
            if score > 0:
                ranked.append((score, idx, chunk, meta))
        ranked.sort(key=lambda x: -x[0])
        
        sources: list[dict] = []
        context_parts: list[str] = []
        for score, idx, chunk, meta in ranked[:req.top_k or TOP_K]:
            sources.append({
                "chunk_index": int(idx),
                "score": float(score),
                "type": meta.get("type"),
                "id":   meta.get("id"),
                "name": meta.get("name"),
                "text": chunk,
            })
            context_parts.append(chunk)
            
        context = "\n\n".join(context_parts)
        answer  = _synthesise(req.query, context)
        return AskResponse(query=req.query, answer=answer, sources=sources)

    try:
        from indexer import embed_single  # noqa: PLC0415
        q_vec = embed_single(req.query)
    except Exception as _embed_err:
        return AskResponse(query=req.query, answer=f"Embedding unavailable: {_embed_err}", sources=[])
    k = min(req.top_k or TOP_K, _faiss_index.ntotal)
    distances, indices = _faiss_index.search(q_vec, k)

    chunks   = _faiss_meta.get("chunks", []) if _faiss_meta else []
    metadata = _faiss_meta.get("metadata", []) if _faiss_meta else []

    sources = []
    context_parts = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < 0:
            continue
        sources.append({
            "chunk_index": int(idx),
            "score": float(dist),
            "type": metadata[idx].get("type"),
            "id":   metadata[idx].get("id"),
            "name": metadata[idx].get("name"),
            "text": chunks[idx],
        })
        context_parts.append(chunks[idx])

    context = "\n\n".join(context_parts)
    answer  = _synthesise(req.query, context)
    return AskResponse(query=req.query, answer=answer, sources=sources)


def _synthesise(query: str, context: str) -> str:
    """
    Fallback synthesis helper matching keywords over text lines.

    Args:
        query (str): The search query.
        context (str): The retrieved chunk text lines.

    Returns:
        str: Summarized bullet list of matching lines.
    """
    lines    = [ln.strip() for ln in context.split("\n") if ln.strip()]
    keywords = query.lower().split()
    matched  = sorted(
        [(sum(1 for kw in keywords if kw in ln.lower()), ln) for ln in lines],
        key=lambda x: -x[0],
    )
    top = [ln for score, ln in matched[:3] if score > 0]
    if top:
        return "Based on the CrowdSense AI knowledge base:\n\n" + "\n\n".join(f"• {l}" for l in top)
    return "I found relevant information but couldn't pinpoint an exact answer:\n\n" + "\n\n".join(f"• {l}" for l in lines[:3])


# ── Routes — Fan Chat (Claude + LangChain) ─────────────────────────────────

@app.post("/api/fan/chat", response_model=FanChatResponse, tags=["Fan Chat"])
async def fan_chat_endpoint(req: FanChatRequest, request: Request) -> FanChatResponse:
    """
    Multilingual fan assistant.
    Retrieves relevant stadium context via FAISS and generates a native-language
    response using Gemini 2.5 Flash.
    Falls back to FAISS-only synthesis if GOOGLE_API_KEY is not set.

    Args:
        req (FanChatRequest): The fan's query, preferred language, current ticket location info, and top_k context limit.
        request (Request): The incoming FastAPI request instance to extract IP for rate limiting.

    Returns:
        FanChatResponse: Generative AI answer along with explainability why explanation and retrieval sources.
    
    Raises:
        HTTPException: If query is empty, too long, contains malicious content, or if client is rate-limited.
    """
    client_ip = "unknown"
    if request and request.client:
        client_ip = request.client.host
    
    # 1. Rate Limit Check
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait a moment.")

    # 2. Input Validation & Sanitization
    query_str = req.query.strip()
    if not query_str:
        raise HTTPException(status_code=422, detail="Query cannot be empty.")
    if len(query_str) > 500:
        raise HTTPException(status_code=422, detail="Query exceeds maximum length of 500 characters.")
    
    # Reject obviously malicious patterns
    malicious_patterns = ["<script", "javascript:", "union select", "drop table", "or 1=1"]
    if any(pat in query_str.lower() for pat in malicious_patterns):
        raise HTTPException(status_code=400, detail="Query contains forbidden patterns or malicious content.")

    # Pass the full density dict (not just a pre-flattened summary) so fan_chat
    # can cross-reference section→gate→density and perform multi-source routing.
    result = await _fan_chat(
        query=query_str,
        language=req.language,
        fan_gate=req.fan_gate,
        fan_section=req.fan_section,
        geolocation=req.geolocation,
        density_raw=_density,
        embed_model=None,
        faiss_index=_faiss_index,
        faiss_meta=_faiss_meta,
        llm=_gemini_llm,
        floorplan=_floorplan,
        k=req.top_k or 5,
        history=req.history,
    )

    return FanChatResponse(
        query=req.query,
        answer=result["answer"],
        why=result.get("why", ""),
        language=result["language"],
        sources=result["sources"],
        fan_location=result["fan_location"],
        llm_used=result["llm_used"],
        routing_alert=result.get("routing_alert", False),
    )


@app.post(
    "/api/fan/detect-language",
    response_model=DetectLanguageResponse,
    tags=["Fan Chat"],
)
def detect_language_endpoint(req: DetectLanguageRequest) -> DetectLanguageResponse:
    """
    Auto-detect the language of a text snippet.
    Returns a supported language code + human-readable name.

    Args:
        req (DetectLanguageRequest): Input snippet to analyze.

    Returns:
        DetectLanguageResponse: The detected code (e.g. 'en', 'es') and name.
    """
    lang = detect_language(req.text)
    return DetectLanguageResponse(
        language=lang,
        language_name=LANGUAGE_NAMES.get(lang, "English"),
    )


@app.get("/api/match-clock", tags=["Stadium"])
def get_match_clock() -> dict:
    """
    Return the current match phase and surge prediction derived from
    the density meta kickoff timestamp. Used by the frontend to show
    a match-clock widget and proactive crowd warnings.

    Returns:
        dict: The match-clock context dictionary and gate-table context metrics.
    """
    from fan_chat import build_match_clock_context, build_live_gate_table  # noqa: PLC0415
    return {
        "match_clock": build_match_clock_context(_density),
        "gate_table":  build_live_gate_table(_density),
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    }


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

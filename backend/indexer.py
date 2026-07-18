"""
indexer.py — CrowdSense AI FAISS Index Builder
================================================
Reads stadium_floorplan.json, chunks each entry into a short text description,
embeds them using Google's Gemini Embedding API (models/text-embedding-004),
and stores the resulting FAISS index + metadata pickle in faiss_index/.

This replaces the previous sentence-transformers / PyTorch local model,
removing the ~2GB PyTorch dependency entirely. The Gemini embedding API is
called via the google-generativeai SDK which is already required for chat.

Run once (or after updating the floor-plan data):
    python indexer.py
"""

import json
import os
import pickle
import time
from pathlib import Path

import faiss
import numpy as np
from dotenv import load_dotenv
import google.genai as genai

load_dotenv()

BASE_DIR       = Path(__file__).parent
FLOORPLAN_FILE = BASE_DIR / "data" / "stadium_floorplan.json"
INDEX_DIR      = BASE_DIR / "faiss_index"
INDEX_FILE     = INDEX_DIR / "stadium.index"
META_FILE      = INDEX_DIR / "metadata.pkl"

# gemini-embedding-001 produces 768-dimensional vectors and is confirmed available
EMBEDDING_MODEL = "models/gemini-embedding-001"
EMBED_DIM       = 768
BATCH_SIZE      = 50   # conservative batch size


def _get_client() -> genai.Client:
    """Return an authenticated google.genai Client."""
    api_key = os.getenv("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY not set. Cannot call Gemini embedding API.")
    return genai.Client(api_key=api_key)


def get_gemini_embedding(texts: list[str]) -> np.ndarray:
    """
    Embed a list of texts using the Gemini embedding API (batch).

    Args:
        texts: List of text strings to embed.

    Returns:
        numpy array of shape (len(texts), EMBED_DIM) in float32.
    """
    client = _get_client()
    all_vectors: list[list[float]] = []
    for start in range(0, len(texts), BATCH_SIZE):
        batch = texts[start : start + BATCH_SIZE]
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=batch,
            config={"task_type": "RETRIEVAL_DOCUMENT"},
        )
        all_vectors.extend([e.values for e in result.embeddings])
        if start + BATCH_SIZE < len(texts):
            time.sleep(0.1)  # polite rate-limiting
    return np.array(all_vectors, dtype=np.float32)


def embed_single(text: str) -> np.ndarray:
    """
    Embed a single query string for FAISS search at runtime.

    Args:
        text: Query string.

    Returns:
        numpy array of shape (1, EMBED_DIM) in float32.
    """
    client = _get_client()
    result = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=[text],
        config={"task_type": "RETRIEVAL_QUERY"},
    )
    vec = np.array(result.embeddings[0].values, dtype=np.float32).reshape(1, -1)
    return vec

def chunk_floorplan(fp: dict) -> tuple[list[str], list[dict]]:
    """Convert floor-plan JSON into flat text chunks + metadata records."""
    chunks: list[str] = []
    metadata: list[dict] = []

    def add(text: str, meta: dict) -> None:
        chunks.append(text)
        metadata.append(meta)

    # ── Gates ────────────────────────────────────────────────────────────
    for g in fp.get("gates", []):
        accessible = "accessible" if g.get("accessible") else "standard"
        transport  = g.get("nearest_transit", "")
        add(
            f"{g['name']} ({g['id']}) is a {accessible} entry gate located at "
            f"coordinates ({g['lat']:.4f}, {g['lng']:.4f}). "
            f"SVG position: ({g.get('svgX', 0)}, {g.get('svgY', 0)}). "
            f"Nearest transport: {transport}.",
            {"type": "gate", "id": g["id"], "name": g["name"]},
        )

    # ── Sections ─────────────────────────────────────────────────────────
    for s in fp.get("sections", []):
        add(
            f"{s['name']} ({s['id']}) is a {s.get('level', '')} bowl section in the "
            f"{s.get('zone', '')} zone. Primary gate: {s.get('primary_gate', '')}. "
            f"Capacity: {s.get('capacity', '')} seats. "
            f"Coordinates: ({s.get('lat', 0.0):.4f}, {s.get('lng', 0.0):.4f}). "
            f"SVG Polygon: {s.get('svgPolygon', '')}.",
            {"type": "section", "id": s["id"], "name": s["name"]},
        )

    poi = fp.get("points_of_interest", {})

    # ── Restrooms ─────────────────────────────────────────────────────────
    for r in poi.get("restrooms", []):
        accessible = "accessible / ADA-compliant" if r.get("accessible") else "standard"
        add(
            f"{r['name']} ({r['id']}) is a {accessible} restroom on {r.get('floor', '')} "
            f"near section {r.get('section_ref', '')} (coordinates: {r.get('lat', 0.0):.4f}, {r.get('lng', 0.0):.4f}). "
            f"SVG position: ({r.get('svgX', 0)}, {r.get('svgY', 0)}).",
            {"type": "restroom", "id": r["id"], "name": r["name"]},
        )

    # ── Medical points ────────────────────────────────────────────────────
    for m in poi.get("medical_points", []):
        equipment = ", ".join(m.get("equipment", []))
        accessible = "accessible" if m.get("accessible") else "standard"
        add(
            f"{m['name']} ({m['id']}) is a {accessible} medical station with {m.get('staff', 0)} staff. "
            f"Located near section {m.get('section_ref', '')} (coordinates: {m.get('lat', 0.0):.4f}, {m.get('lng', 0.0):.4f}). "
            f"Equipment: {equipment}. "
            f"SVG position: ({m.get('svgX', 0)}, {m.get('svgY', 0)}).",
            {"type": "medical", "id": m["id"], "name": m["name"]},
        )

    # ── Food courts ───────────────────────────────────────────────────────
    for f in poi.get("food_courts", []):
        vendors  = ", ".join(f.get("vendors", []))
        dietary  = ", ".join(f.get("dietary", []))
        accessible = "accessible" if f.get("accessible") else "standard"
        add(
            f"{f['name']} ({f['id']}) is a {accessible} food court near section {f.get('section_ref', '')} "
            f"(coordinates: {f.get('lat', 0.0):.4f}, {f.get('lng', 0.0):.4f}). "
            f"Vendors: {vendors}. "
            f"Dietary options: {dietary}. "
            f"SVG position: ({f.get('svgX', 0)}, {f.get('svgY', 0)}).",
            {"type": "food_court", "id": f["id"], "name": f["name"], "dietary": f.get("dietary", [])},
        )

    # ── Accessible entries ────────────────────────────────────────────────
    for a in poi.get("accessible_entries", []):
        features = ", ".join(a.get("features", []))
        desc = a.get("description", "")
        add(
            f"Accessible entry point {a['id']} referencing gate {a.get('gate_ref', '')}. "
            f"Details: {desc}. Features: {features}. "
            f"Coordinates: ({a.get('lat', 0.0):.4f}, {a.get('lng', 0.0):.4f}). "
            f"SVG position: ({a.get('svgX', 0)}, {a.get('svgY', 0)}).",
            {"type": "accessible_entry", "id": a["id"], "name": a["id"]},
        )

    return chunks, metadata


def main() -> None:
    print("[CrowdSense AI] Building FAISS index with Gemini embeddings...")

    # 1. Load data
    with open(FLOORPLAN_FILE, encoding="utf-8") as fh:
        fp = json.load(fp=fh)

    # 2. Chunk
    chunks, metadata = chunk_floorplan(fp)
    print(f"   {len(chunks)} chunks created.")

    # 3. Embed via Gemini API (no local model / PyTorch needed)
    print(f"   Embedding {len(chunks)} chunks via Gemini {EMBEDDING_MODEL}...")
    embeddings = get_gemini_embedding(chunks)
    print(f"   Embeddings shape: {embeddings.shape}")

    # 4. Build FAISS index
    dim   = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    print(f"   FAISS index built — {index.ntotal} vectors, dim={dim}.")

    # 5. Persist
    INDEX_DIR.mkdir(exist_ok=True)
    faiss.write_index(index, str(INDEX_FILE))
    with open(META_FILE, "wb") as fh:
        pickle.dump({"chunks": chunks, "metadata": metadata}, fh)

    print(f"   Saved index to {INDEX_FILE}")
    print("   Done.")


if __name__ == "__main__":
    main()

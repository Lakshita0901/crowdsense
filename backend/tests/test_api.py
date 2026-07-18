import os
import math
import pytest
from fastapi.testclient import TestClient

# Adjust path so pytest can find backend modules
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app, check_rate_limit, _rate_limit_records
from fan_chat import calculate_decayed_load


@pytest.fixture(autouse=True)
def clean_rate_limits():
    """Clear rate limit records before each test to prevent 429 errors."""
    _rate_limit_records.clear()


def test_health_endpoint():
    """Test that health check endpoint returns 200 and expected status flags."""
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "faiss_index_ready" in data
        assert "gemini_ready" in data


def test_floorplan_endpoint():
    """Test that floorplan endpoint returns 200 and valid stadium layout."""
    with TestClient(app) as client:
        response = client.get("/api/floorplan")
        assert response.status_code == 200
        data = response.json()
        assert "gates" in data
        assert "sections" in data


def test_density_endpoints():
    """Test /api/density and /api/density/update behaviors including bounds."""
    with TestClient(app) as client:
        # Check initial density
        response = client.get("/api/density")
        assert response.status_code == 200
        initial_data = response.json()
        assert "gates" in initial_data
        
        # Check update simulation returns successfully
        update_response = client.post("/api/density/update")
        assert update_response.status_code == 200
        updated_data = update_response.json()
        assert "stadium_totals" in updated_data

        # Check update limits and boundaries
        for gate in updated_data["gates"]:
            assert gate["current_count"] >= 0
            assert gate["current_count"] <= gate["capacity"]
            assert gate["pct"] >= 0
            assert gate["pct"] <= 100


def test_fan_chat_valid_query():
    """Test /api/fan/chat returns expected JSON structure and a successful status code."""
    with TestClient(app) as client:
        payload = {
            "query": "Where is the nearest restroom to Gate A?",
            "language": "en",
            "fan_gate": "GATE_A",
            "fan_section": "SEC_101",
            "top_k": 3
        }
        response = client.post("/api/fan/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["query"] == payload["query"]
        assert "answer" in data
        assert "why" in data
        assert "sources" in data
        assert "llm_used" in data
        assert "language" in data
        assert "fan_location" in data
        assert "routing_alert" in data


def test_fan_chat_edge_cases():
    """Test fan chat handles empty strings, invalid gates, mismatched sections, and bad top_k parameters."""
    with TestClient(app) as client:
        # 1. Empty query string (returns 422 Unprocessable Entity)
        res_empty = client.post("/api/fan/chat", json={"query": ""})
        assert res_empty.status_code == 422

        # 2. Query too long (> 500 characters)
        res_too_long = client.post("/api/fan/chat", json={"query": "a" * 501})
        assert res_too_long.status_code == 422

        # 3. Malicious pattern query
        res_malicious = client.post("/api/fan/chat", json={"query": "<script>alert(1)</script>"})
        assert res_malicious.status_code == 400

        # 4. Unknown/invalid gate
        res_bad_gate = client.post("/api/fan/chat", json={
            "query": "restroom?",
            "fan_gate": "GATE_XYZ",
            "fan_section": None
        })
        assert res_bad_gate.status_code == 200
        assert res_bad_gate.json()["routing_alert"] is False

        # 5. Mismatched gate and section (routing alert should not crash)
        res_mismatched = client.post("/api/fan/chat", json={
            "query": "restroom?",
            "fan_gate": "GATE_A",
            "fan_section": "SEC_140"  # Section 140 is typically under Gate E/F
        })
        assert res_mismatched.status_code == 200

        # 6. Missing geolocation (should work fine)
        res_no_geo = client.post("/api/fan/chat", json={
            "query": "Where is the exit?",
            "geolocation": None
        })
        assert res_no_geo.status_code == 200

        # 7. top_k = 0 and top_k larger than available data
        res_k_zero = client.post("/api/fan/chat", json={
            "query": "food",
            "top_k": 0
        })
        assert res_k_zero.status_code == 200
        
        res_k_large = client.post("/api/fan/chat", json={
            "query": "food",
            "top_k": 999
        })
        assert res_k_large.status_code == 200
        assert len(res_k_large.json()["sources"]) <= 999


def test_faiss_only_fallback(monkeypatch):
    """Test that setting GOOGLE_API_KEY to empty triggers the FAISS fallback path cleanly."""
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    with TestClient(app) as client:
        payload = {
            "query": "restroom info",
            "language": "en"
        }
        response = client.post("/api/fan/chat", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["llm_used"] is False
        assert "⚠️ AI generation unavailable" in data["answer"]


def test_route_load_balancing_decay():
    """Verify decay mathematics over simulated times."""
    # Start with full congestion load (100.0)
    initial_load = 100.0
    
    # 0 elapsed time means no decay
    assert calculate_decayed_load(initial_load, 0) == 100.0
    
    # Decay over 10 minutes (decay_rate = 0.05) -> 100 * exp(-0.5) ~ 60.65
    decayed_10 = calculate_decayed_load(initial_load, 10, decay_rate=0.05)
    assert 60.0 < decayed_10 < 61.0
    
    # Decay over 120 minutes -> should be extremely small
    decayed_120 = calculate_decayed_load(initial_load, 120, decay_rate=0.05)
    assert decayed_120 < 1.0

    # Ensure negative load doesn't crash and returns 0
    assert calculate_decayed_load(-5.0, 10) == 0.0


def test_detect_language_endpoint():
    """Test /api/fan/detect-language with sample text in each of the 5 supported languages."""
    with TestClient(app) as client:
        # English
        res_en = client.post("/api/fan/detect-language", json={"text": "Where is the nearest restroom?"})
        assert res_en.status_code == 200
        assert res_en.json()["language"] == "en"

        # Spanish
        res_es = client.post("/api/fan/detect-language", json={"text": "¿Dónde está el baño más cercano?"})
        assert res_es.status_code == 200
        assert res_es.json()["language"] == "es"

        # French
        res_fr = client.post("/api/fan/detect-language", json={"text": "Où se trouvent les toilettes les plus proches?"})
        assert res_fr.status_code == 200
        assert res_fr.json()["language"] == "fr"

        # German
        res_de = client.post("/api/fan/detect-language", json={"text": "Wo ist die nächste Toilette?"})
        assert res_de.status_code == 200
        assert res_de.json()["language"] == "de"

        # Portuguese
        res_pt = client.post("/api/fan/detect-language", json={"text": "Onde fica o banheiro mais próximo?"})
        assert res_pt.status_code == 200
        assert res_pt.json()["language"] == "pt"


def test_ops_rag_ask_endpoint():
    """Test /api/ask (Ops RAG endpoint) with a valid query and an empty query."""
    with TestClient(app) as client:
        # Valid query
        res_valid = client.post("/api/ask", json={"query": "restroom", "top_k": 3})
        assert res_valid.status_code == 200
        data_valid = res_valid.json()
        assert "answer" in data_valid
        assert len(data_valid["sources"]) > 0

        # Empty query
        res_empty = client.post("/api/ask", json={"query": "", "top_k": 3})
        assert res_empty.status_code == 200
        data_empty = res_empty.json()
        assert "answer" in data_empty


def test_xai_reasoning_generation_directly():
    """Verify why_reason is populated and contains real data-derived content when a gate is critical/high."""
    with TestClient(app) as client:
        import main
        original_gates = [dict(g) for g in main._density["gates"]]
        try:
            # Set GATE_A to critical
            for g in main._density["gates"]:
                if g["gate_id"] == "GATE_A":
                    g["status"] = "critical"
                    g["pct"] = 95.0
                    g["current_count"] = 950
                    g["avg_wait_minutes"] = 25
                elif g["gate_id"] == "GATE_B":
                    g["status"] = "low"
                    g["pct"] = 10.0
                    g["current_count"] = 100
                    g["avg_wait_minutes"] = 2

            res = client.post("/api/fan/chat", json={
                "query": "Where is the exit?",
                "fan_gate": "GATE_A",
                "fan_section": "SEC_101",
                "language": "en"
            })
            assert res.status_code == 200
            data = res.json()
            assert data["routing_alert"] is True
            # Expect why field populated with critical data explanation
            assert data["why"] != ""
            assert "Gate A" in data["why"] or "GATE_A" in data["why"]
            assert "95" in data["why"]
            assert "Gate B" in data["why"] or "GATE_B" in data["why"]
        finally:
            main._density["gates"] = original_gates


def test_gate_section_validation_mismatch():
    """Verify that a request with mismatched section/gate uses the section's actual primary gate."""
    with TestClient(app) as client:
        import main
        original_gates = [dict(g) for g in main._density["gates"]]
        try:
            # SEC_101 has primary_gate GATE_A. We set GATE_A to critical.
            # But we request with fan_gate="GATE_E" (mismatched) and fan_section="SEC_101".
            # If the code uses the correct primary gate for SEC_101, it should still trigger a routing alert on GATE_A.
            for g in main._density["gates"]:
                if g["gate_id"] == "GATE_A":
                    g["status"] = "critical"
                    g["pct"] = 95.0
                elif g["gate_id"] == "GATE_B":
                    g["status"] = "low"
                    g["pct"] = 10.0

            res = client.post("/api/fan/chat", json={
                "query": "Where is the exit?",
                "fan_gate": "GATE_E",  # mismatched gate
                "fan_section": "SEC_101",
                "language": "en"
            })
            assert res.status_code == 200
            data = res.json()
            # It should correct and detect that SEC_101 is served by critical GATE_A, triggering the alert.
            assert data["routing_alert"] is True
            assert "Gate A" in data["why"]
        finally:
            main._density["gates"] = original_gates


def test_multilingual_responses(monkeypatch):
    """Test that fan_chat responses in Spanish, French, German, and Portuguese are actually returned in those languages."""
    monkeypatch.setenv("GOOGLE_API_KEY", "")
    with TestClient(app) as client:
        # Spanish
        res_es = client.post("/api/fan/chat", json={"query": "restroom", "language": "es"})
        assert res_es.status_code == 200
        assert "Generación" in res_es.json()["answer"] or "información" in res_es.json()["answer"]

        # French
        res_fr = client.post("/api/fan/chat", json={"query": "restroom", "language": "fr"})
        assert res_fr.status_code == 200
        assert "Génération" in res_fr.json()["answer"] or "informations" in res_fr.json()["answer"]

        # German
        res_de = client.post("/api/fan/chat", json={"query": "restroom", "language": "de"})
        assert res_de.status_code == 200
        assert "Generierung" in res_de.json()["answer"] or "Stadioninformationen" in res_de.json()["answer"]

        # Portuguese
        res_pt = client.post("/api/fan/chat", json={"query": "restroom", "language": "pt"})
        assert res_pt.status_code == 200
        assert "Geração" in res_pt.json()["answer"] or "informações" in res_pt.json()["answer"]


def test_dietary_food_filtering():
    """Verify that a dietary-filtered query returns only matching food locations in search and metadata."""
    with TestClient(app) as client:
        # Ask for vegan food near Section 102
        res = client.post("/api/fan/chat", json={
            "query": "Where can I find vegan options?",
            "language": "en"
        })
        assert res.status_code == 200
        data = res.json()
        
        # Check retrieved sources in response
        sources = data.get("sources", [])
        assert len(sources) > 0
        
        import main
        from fan_chat import retrieve_docs
        
        # Directly verify the retrieve_docs function post-filtering behavior
        docs = retrieve_docs(
            query="Where can I find vegan options?",
            embed_model=None,
            faiss_index=main._faiss_index,
            faiss_meta=main._faiss_meta,
            k=5
        )
        
        food_docs = [d for d in docs if d.metadata.get("type") == "food_court"]
        assert len(food_docs) > 0  # retrieved at least one food court
        for d in food_docs:
            assert "vegan" in d.metadata.get("dietary", [])
            
        # Verify halal filtering
        docs_halal = retrieve_docs(
            query="nearest halal food near Gate C",
            embed_model=None,
            faiss_index=main._faiss_index,
            faiss_meta=main._faiss_meta,
            k=5
        )
        food_docs_halal = [d for d in docs_halal if d.metadata.get("type") == "food_court"]
        assert len(food_docs_halal) > 0
        for d in food_docs_halal:
            assert "halal" in d.metadata.get("dietary", [])


def test_conversation_memory():
    """Test that the /api/fan/chat endpoint accepts conversation history and resolves follow-ups."""
    with TestClient(app) as client:
        # First query: ask about Gate C wait time
        history = [
            {"role": "user", "text": "What is the wait time at Gate C?"},
            {"role": "ai", "text": "Gate C has a wait time of approximately 10 minutes right now."}
        ]
        
        # Follow-up query asking "can you give me directions to go there?"
        res = client.post("/api/fan/chat", json={
            "query": "can you give me directions to go there?",
            "language": "en",
            "history": history
        })
        assert res.status_code == 200
        data = res.json()
        assert data["answer"] is not None
        
        # Verify retrieve_docs query expansion behavior directly
        import main
        from fan_chat import retrieve_docs
        from main import ChatMessage
        
        history_objs = [
            ChatMessage(role="user", text="What is the wait time at Gate C?"),
            ChatMessage(role="ai", text="Gate C has a wait time of approximately 10 minutes.")
        ]
        
        docs = retrieve_docs(
            query="can you give me directions to go there?",
            embed_model=None,
            faiss_index=main._faiss_index,
            faiss_meta=main._faiss_meta,
            k=5,
            history=history_objs
        )
        
        # Verify that the retrieved documents match Gate C
        gate_docs = [d for d in docs if "Gate C" in d.page_content or "GATE_C" in d.page_content]
        assert len(gate_docs) > 0

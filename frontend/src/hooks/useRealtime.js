// src/hooks/useRealtime.js
// Polls /api/density every `intervalMs` ms and optionally triggers a density tick

import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function useRealtime(intervalMs = 5000) {
  const [density, setDensity]       = useState(null);
  const [floorplan, setFloorplan]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [tickCount, setTickCount]   = useState(0);

  // Load static floor plan once
  useEffect(() => {
    fetch(`${API}/api/floorplan`)
      .then(r => r.json())
      .then(setFloorplan)
      .catch(e => setError(e.message));
  }, []);

  // Fetch density snapshot
  const fetchDensity = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/density`);
      const data = await res.json();
      setDensity(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger a simulation tick then re-fetch
  const tick = useCallback(async () => {
    try {
      await fetch(`${API}/api/density/update`, { method: 'POST' });
      await fetchDensity();
      setTickCount(c => c + 1);
    } catch (e) {
      setError(e.message);
    }
  }, [fetchDensity]);

  // Initial load
  useEffect(() => { fetchDensity(); }, [fetchDensity]);

  // Recurring tick
  useEffect(() => {
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [tick, intervalMs]);

  return { density, floorplan, loading, error, tickCount, refetch: fetchDensity };
}

// Ask the RAG endpoint
export async function askQuestion(query, topK = 5) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const res = await fetch(`${API_URL}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Fan Chat RAG + Gemini endpoint
export async function fanChat(query, language, fanGate, fanSection, geolocation, topK = 5) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const res = await fetch(`${API_URL}/api/fan/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      language,
      fan_gate: fanGate || null,
      fan_section: fanSection || null,
      geolocation: geolocation || null,
      top_k: topK,
    }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Auto-detect language
export async function detectLanguage(text) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const res = await fetch(`${API_URL}/api/fan/detect-language`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

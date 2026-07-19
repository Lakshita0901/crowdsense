// src/hooks/useRealtime.js
// Polls /api/density every `intervalMs` ms and optionally triggers a density tick

import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Shared utility function to make API requests.
 * Handles base URL configuration, headers, body serialization, and checks response status.
 */
async function request(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = { ...options.headers };
  const fetchOptions = { ...options, headers };

  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export function useRealtime(intervalMs = 5000) {
  const [density, setDensity]       = useState(null);
  const [floorplan, setFloorplan]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [tickCount, setTickCount]   = useState(0);
  const isPollingRef = useRef(false);

  // Load static floor plan once
  useEffect(() => {
    request('/api/floorplan')
      .then(setFloorplan)
      .catch(e => setError(e.message));
  }, []);

  // Fetch density snapshot
  const fetchDensity = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      const data = await request('/api/density');
      setDensity(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      isPollingRef.current = false;
    }
  }, []);

  // Trigger a simulation tick then re-fetch
  const tick = useCallback(async () => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;
    try {
      await request('/api/density/update', { method: 'POST' });
      // Call direct fetch logic without double-setting isPollingRef
      const data = await request('/api/density');
      setDensity(data);
      setError(null);
      setTickCount(c => c + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      isPollingRef.current = false;
    }
  }, []);

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
  return request('/api/ask', {
    method: 'POST',
    body: { query, top_k: topK },
  });
}

// Fan Chat RAG + Gemini endpoint
export async function fanChat(query, language, fanGate, fanSection, geolocation, topK = 5, history = []) {
  return request('/api/fan/chat', {
    method: 'POST',
    body: {
      query,
      language,
      fan_gate: fanGate || null,
      fan_section: fanSection || null,
      geolocation: geolocation || null,
      top_k: topK,
      history: history || [],
    },
  });
}

// Auto-detect language
export async function detectLanguage(text) {
  return request('/api/fan/detect-language', {
    method: 'POST',
    body: { text },
  });
}


// src/components/FanChatPanel.jsx
// Consumer-app redesign: light background, FIFA teal/gold palette,
// friendly typography, WhatsApp-style chat bubbles.
// Functionality is 100% identical to the previous version.

import React, { useState, useRef, useEffect } from 'react';
import { fanChat, detectLanguage } from '../hooks/useRealtime';

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'auto', name: 'Auto-Detect', flag: '🌐' },
  { code: 'en',   name: 'English',     flag: '🇺🇸' },
  { code: 'es',   name: 'Español',     flag: '🇲🇽' },
  { code: 'pt',   name: 'Português',   flag: '🇧🇷' },
  { code: 'de',   name: 'Deutsch',     flag: '🇩🇪' },
  { code: 'fr',   name: 'Français',    flag: '🇫🇷' },
];

const GREETINGS = {
  auto: "Hi! I'm **CrowdSense AI** 🏟️\n\nChoose your language or start typing — I'll auto-detect it and help you navigate MetLife Stadium.",
  en:   "Hi there! I'm **CrowdSense AI** 🏟️\n\nAsk me anything about MetLife Stadium — gate locations, crowd conditions, restrooms, medical points, or food courts. I'm here to help!",
  es:   "¡Hola! Soy **CrowdSense AI** 🏟️\n\nPregúntame lo que quieras sobre el MetLife Stadium. ¡Estoy aquí para ayudarte!",
  pt:   "Olá! Eu sou o **CrowdSense AI** 🏟️\n\nPergunte-me qualquer coisa sobre o MetLife Stadium. Estou aqui para ajudar!",
  de:   "Hallo! Ich bin **CrowdSense AI** 🏟️\n\nFragen Sie mich alles über das MetLife-Stadion. Ich helfe Ihnen gerne!",
  fr:   "Bonjour ! Je suis **CrowdSense AI** 🏟️\n\nPosez-moi vos questions sur le MetLife Stadium. Je suis là pour vous aider !",
};

const QUICK_PROMPTS_BY_LANG = {
  en: ['Nearest restroom to Gate C', 'How do I get to Section 214', 'Nearest food court to Gate A', 'Medical point near Section 102'],
  es: ['Baño más cercano a la Puerta C', 'Cómo llego a la Sección 214', 'Patio de comidas cerca de la Puerta A', 'Punto médico cerca de la Sección 102'],
  pt: ['Banheiro mais próximo do Portão C', 'Como chegar à Seção 214', 'Praça de alimentação perto do Portão A', 'Posto médico perto da Seção 102'],
  de: ['Toilette bei Tor C', 'Wie komme ich zu Sektor 214', 'Essensbereich bei Tor A', 'Sanitätsstation bei Sektor 102'],
  fr: ['Toilettes près de la Porte C', 'Comment aller à la Section 214', 'Restauration près de la Porte A', 'Poste médical près de la Section 102'],
};

const PLACEHOLDERS = {
  auto: 'Ask me anything…',
  en: 'Ask me anything…',
  es: 'Pregúntame algo…',
  pt: 'Pergunte-me algo…',
  de: 'Frag mich etwas…',
  fr: 'Posez une question…',
};

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  // Panel backgrounds
  panelBg:    '#f0f7f5',       // very light teal-tinted white
  headerBg:   '#0a7c6e',       // FIFA deep teal
  headerBg2:  '#088a7a',
  chatBg:     '#e8f4f1',       // light mint
  inputArea:  '#f0f7f5',

  // Bubbles
  aiBubble:   '#ffffff',
  userBubble: '#0a7c6e',
  userText:   '#ffffff',
  aiText:     '#1a2e2a',

  // Accents
  teal:       '#0a7c6e',
  tealLight:  '#d0ede9',
  tealMid:    '#14b8a6',
  gold:       '#d4950a',
  goldLight:  '#fef3c7',

  // UI
  border:     '#c8e6e0',
  muted:      '#6b8f89',
  label:      '#374b47',
  placeholder:'#9ab5b0',
  chipBg:     '#ffffff',
  chipBorder: '#b2d8d2',
  chipText:   '#0a7c6e',

  // Status
  successBg:  '#d1fae5',
  successText:'#065f46',
  warnBg:     '#fef3c7',
  warnText:   '#92400e',
  errorBg:    '#fee2e2',
  errorText:  '#991b1b',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function FanChatPanel({
  floorplan,
  selectedGate,    setSelectedGate,
  selectedSection, setSelectedSection,
  gpsLocation,     setGpsLocation,
}) {
  const [lang,         setLang]         = useState('auto');
  const [detectedLang, setDetectedLang] = useState(null);
  const [gpsLoading,   setGpsLoading]   = useState(false);
  const [gpsError,     setGpsError]     = useState(null);
  const [messages,     setMessages]     = useState([
    { role: 'ai', text: GREETINGS.auto, timestamp: new Date() },
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const activeLang = lang === 'auto' ? (detectedLang || 'en') : lang;

  useEffect(() => {
    if (messages.length === 1 && messages[0].role === 'ai') {
      setMessages([{ role: 'ai', text: GREETINGS[lang] || GREETINGS.auto, timestamp: new Date() }]);
    }
  }, [lang]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const captureGps = () => {
    if (!navigator.geolocation) { setGpsError('Geolocation not supported by this browser.'); return; }
    setGpsLoading(true); setGpsError(null); setGpsLocation(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGpsLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }); setGpsLoading(false); },
      (err) => { console.warn('GPS failed:', err.message); setGpsError('Location unavailable — please select your gate manually.'); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };
  const clearGps = () => { setGpsLocation(null); setGpsError(null); };

  // Auto-reset section if the selected gate changes and the section is no longer valid
  useEffect(() => {
    if (selectedGate && selectedSection) {
      const currentSec = sections.find(s => s.id === selectedSection);
      if (currentSec && currentSec.primary_gate !== selectedGate) {
        setSelectedSection('');
      }
    }
  }, [selectedGate, selectedSection, sections, setSelectedSection]);

  const send = async (text) => {
    const query = (text || input).trim();
    if (!query || loading) return;
    setInput(''); setError(null);
    setMessages(prev => [...prev, { role: 'user', text: query, timestamp: new Date() }]);
    setLoading(true);
    try {
      let targetLang = lang;
      if (lang === 'auto') {
        try { const d = await detectLanguage(query); targetLang = d.language; setDetectedLang(d.language); }
        catch { targetLang = 'en'; }
      }
      const res = await fanChat(query, targetLang, selectedGate, selectedSection,
        gpsLocation ? { lat: gpsLocation.lat, lng: gpsLocation.lng } : null);
      setMessages(prev => [...prev, {
        role: 'ai', text: res.answer, sources: res.sources,
        llmUsed: res.llm_used, language: res.language, timestamp: new Date(),
      }]);
    } catch {
      setError('Could not reach the server. Please check port 8000.');
      setMessages(prev => [...prev, { role: 'ai', text: '⚠️ Connection failed. Please make sure the backend is running.', timestamp: new Date(), isError: true }]);
    } finally {
      setLoading(false); inputRef.current?.focus();
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  const gates    = floorplan?.gates    ?? [];
  const sections = floorplan?.sections ?? [];
  const prompts  = QUICK_PROMPTS_BY_LANG[activeLang] || QUICK_PROMPTS_BY_LANG.en;

  const filteredSections = selectedGate
    ? sections.filter(s => s.primary_gate === selectedGate)
    : sections;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.panelBg, borderRadius: '20px',
      overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      border: `1px solid ${C.border}`,
      fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
    }}>

      {/* ── Header banner ──────────────────────────────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.headerBg} 0%, ${C.headerBg2} 100%)`,
        padding: '16px 16px 14px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: 42, height: 42, borderRadius: 14,
              background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22,
            }}>🏟️</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                Fan Assistant
              </div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
                FIFA World Cup 2026 · MetLife Stadium
              </div>
            </div>
          </div>

          {/* Language picker */}
          <div style={{ position: 'relative' }}>
            <select
              value={lang}
              onChange={e => { setLang(e.target.value); if (e.target.value !== 'auto') setDetectedLang(null); }}
              style={{
                background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff', borderRadius: 10, padding: '6px 10px',
                fontSize: 12, fontWeight: 500, cursor: 'pointer', outline: 'none',
                appearance: 'none', paddingRight: 24,
              }}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code} style={{ background: C.headerBg, color: '#fff' }}>
                  {l.flag} {l.name}
                </option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: 10, pointerEvents: 'none' }}>▾</span>
          </div>
        </div>

        {/* Auto-detect badge */}
        {lang === 'auto' && detectedLang && (
          <div style={{
            marginTop: 10,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.2)', borderRadius: 20,
            padding: '4px 12px', fontSize: 11, color: '#fff', fontWeight: 600,
          }}>
            🌐 Language auto-detected: <span style={{ textTransform: 'uppercase' }}>{detectedLang}</span>
          </div>
        )}
      </div>

      {/* ── Location card ──────────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', margin: '12px 12px 0',
        borderRadius: 16, padding: '14px',
        boxShadow: '0 2px 8px rgba(10,124,110,0.08)',
        border: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          📍 Your Location
        </div>

        {/* Gate + Section dropdowns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <SelectField
            value={selectedGate}
            onChange={e => setSelectedGate(e.target.value)}
            placeholder="🚪 Gate"
            options={gates.map(g => ({ value: g.id, label: g.name }))}
          />
          <SelectField
            value={selectedSection}
            onChange={e => setSelectedSection(e.target.value)}
            placeholder="🎫 Section"
            options={filteredSections.map(s => ({ value: s.id, label: s.name }))}
          />
        </div>

        {/* Use My Location — primary CTA */}
        <button
          id="btn-use-my-location"
          onClick={gpsLocation ? clearGps : captureGps}
          disabled={gpsLoading}
          style={{
            width: '100%', padding: '11px 16px',
            borderRadius: 12, border: 'none', cursor: gpsLoading ? 'wait' : 'pointer',
            fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.18s ease',
            ...(gpsLocation
              ? { background: C.successBg, color: C.successText }
              : { background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`, color: '#fff', boxShadow: '0 4px 12px rgba(10,124,110,0.30)' }
            ),
            opacity: gpsLoading ? 0.7 : 1,
          }}
          onMouseOver={e => { if (!gpsLoading && !gpsLocation) e.currentTarget.style.transform = 'translateY(-1px)'; }}
          onMouseOut={e => { e.currentTarget.style.transform = 'none'; }}
        >
          <span style={{ fontSize: 16 }}>📍</span>
          {gpsLoading
            ? 'Detecting your location…'
            : gpsLocation
              ? '✓ Location detected — tap to clear'
              : 'Use My Location'
          }
        </button>

        {/* GPS feedback */}
        {gpsLocation && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 10,
            background: C.successBg, color: C.successText,
            fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span>●</span>
            <span>Location set · {gpsLocation.lat.toFixed(4)}, {gpsLocation.lng.toFixed(4)}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 400, opacity: 0.7 }}>~{Math.round(gpsLocation.accuracy ?? 0)}m accuracy</span>
          </div>
        )}
        {gpsError && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 10,
            background: C.warnBg, color: C.warnText,
            fontSize: 11, fontWeight: 500, display: 'flex', gap: 6, alignItems: 'flex-start',
          }}>
            <span>⚠</span><span>{gpsError}</span>
          </div>
        )}

        {/* GPS disclaimer */}
        <p style={{ margin: '8px 0 0', fontSize: 10, color: C.placeholder, textAlign: 'center' }}>
          GPS works best outdoors · Use Gate/Section inside the stadium
        </p>
      </div>

      {/* ── Chat thread ─────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 12px 8px',
        background: C.chatBg, display: 'flex', flexDirection: 'column', gap: 10,
      }}
        className="custom-scroll"
      >
        {messages.map((msg, i) => <Bubble key={i} message={msg} />)}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick prompts ────────────────────────────────────────────────────── */}
      <div style={{
        background: C.inputArea, padding: '10px 12px 6px',
        borderTop: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>
          Suggested questions
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {prompts.map((p, i) => (
            <button
              key={i}
              onClick={() => send(p)}
              disabled={loading}
              style={{
                padding: '6px 12px', borderRadius: 20,
                border: `1.5px solid ${C.chipBorder}`,
                background: C.chipBg, color: C.chipText,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                maxWidth: 195, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                opacity: loading ? 0.45 : 1,
                boxShadow: '0 1px 4px rgba(10,124,110,0.08)',
              }}
              onMouseOver={e => { if (!loading) { e.currentTarget.style.background = C.tealLight; e.currentTarget.style.borderColor = C.teal; }}}
              onMouseOut={e => { e.currentTarget.style.background = C.chipBg; e.currentTarget.style.borderColor = C.chipBorder; }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Input bar ────────────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px 12px', background: C.inputArea, flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: '#fff', borderRadius: 18,
          border: `1.5px solid ${C.border}`,
          padding: '8px 8px 8px 14px',
          boxShadow: '0 2px 8px rgba(10,124,110,0.08)',
          transition: 'border-color 0.2s',
        }}
          onFocusCapture={e => e.currentTarget.style.borderColor = C.teal}
          onBlurCapture={e => e.currentTarget.style.borderColor = C.border}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={PLACEHOLDERS[activeLang] || PLACEHOLDERS.en}
            disabled={loading}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 14, color: C.aiText, lineHeight: 1.5,
              resize: 'none', fontFamily: 'inherit',
              maxHeight: 88, minHeight: '1.5rem',
              placeholderColor: C.placeholder,
              opacity: loading ? 0.6 : 1,
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: 12, border: 'none',
              background: (!input.trim() || loading)
                ? '#c8e6e0'
                : `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`,
              color: '#fff', cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.18s ease',
              boxShadow: (!input.trim() || loading) ? 'none' : '0 3px 10px rgba(10,124,110,0.35)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        {error && (
          <p style={{ margin: '6px 4px 0', fontSize: 11, color: '#dc2626', fontWeight: 500 }}>
            ⚠ {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────

function Bubble({ message }) {
  const isUser = message.role === 'user';
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const renderText = (text) =>
    text.split('\n').map((line, i, arr) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <React.Fragment key={i}>
          {parts.map((part, j) =>
            part.startsWith('**') && part.endsWith('**')
              ? <strong key={j} style={{ fontWeight: 700, color: isUser ? '#fff' : C.teal }}>{part.slice(2, -2)}</strong>
              : <span key={j}>{part}</span>
          )}
          {i < arr.length - 1 && <br />}
        </React.Fragment>
      );
    });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      animation: 'fadeInUp 0.25s ease-out',
    }}>
      {/* Avatar for AI */}
      {!isUser && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '88%' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, marginBottom: 2,
          }}>🏟️</div>

          <div>
            <div style={{
              background: message.isError ? C.errorBg : '#fff',
              color: message.isError ? C.errorText : C.aiText,
              borderRadius: '18px 18px 18px 4px',
              padding: '12px 16px',
              fontSize: 13.5, lineHeight: 1.6,
              boxShadow: '0 2px 10px rgba(10,124,110,0.10)',
              border: message.isError ? `1px solid #fca5a5` : `1px solid ${C.border}`,
            }}>
              {renderText(message.text)}

              {/* Sources accordion */}
              {message.sources?.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <button
                    onClick={() => setSourcesOpen(o => !o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: C.teal, fontWeight: 700, fontSize: 11, padding: 0,
                      fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ fontSize: 9 }}>{sourcesOpen ? '▼' : '►'}</span>
                    Sources
                    <span style={{
                      background: C.tealLight, color: C.teal, borderRadius: 20,
                      padding: '1px 7px', fontSize: 10, fontWeight: 700,
                    }}>{message.sources.length}</span>
                  </button>
                  {sourcesOpen && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }} className="custom-scroll">
                      {message.sources.map((s, i) => (
                        <div key={i} style={{
                          background: C.panelBg, borderRadius: 10, padding: '8px 10px',
                          fontSize: 10.5, border: `1px solid ${C.border}`,
                        }}>
                          <div style={{ fontWeight: 700, color: C.label, marginBottom: 3 }}>
                            {s.type?.replace('_', ' ')}: {s.name}
                            <span style={{ float: 'right', fontWeight: 400, color: C.muted, fontFamily: 'monospace' }}>{s.score?.toFixed(2)}</span>
                          </div>
                          <div style={{ color: C.muted, lineHeight: 1.5 }}>{s.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Timestamp + model badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, paddingLeft: 2 }}>
              {message.llmUsed !== undefined && (
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  color: message.llmUsed ? C.teal : C.muted,
                  background: message.llmUsed ? C.tealLight : '#f1f5f4',
                  padding: '2px 8px', borderRadius: 20,
                }}>
                  {message.llmUsed ? '✦ Gemini 2.5 Flash' : '◈ Retrieval'}
                </span>
              )}
              <span style={{ fontSize: 10, color: C.placeholder }}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User bubble */}
      {isUser && (
        <div style={{ maxWidth: '80%' }}>
          <div style={{
            background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`,
            color: '#fff', borderRadius: '18px 18px 4px 18px',
            padding: '12px 16px', fontSize: 13.5, lineHeight: 1.6,
            boxShadow: '0 3px 12px rgba(10,124,110,0.25)',
          }}>
            {renderText(message.text)}
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: C.placeholder, marginTop: 4, paddingRight: 2 }}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 10, flexShrink: 0,
        background: `linear-gradient(135deg, ${C.teal}, ${C.tealMid})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>🏟️</div>
      <div style={{
        background: '#fff', borderRadius: '18px 18px 18px 4px', padding: '14px 18px',
        display: 'flex', gap: 5, alignItems: 'center',
        boxShadow: '0 2px 10px rgba(10,124,110,0.10)', border: `1px solid ${C.border}`,
      }}>
        {[0, 0.18, 0.36].map((d, i) => (
          <span key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: C.teal, display: 'inline-block',
            animation: `bounce 1.1s ${d}s infinite ease-in-out`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ─── Reusable styled select ───────────────────────────────────────────────────

function SelectField({ value, onChange, placeholder, options }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={onChange}
        style={{
          width: '100%', padding: '9px 28px 9px 11px',
          borderRadius: 12, border: `1.5px solid ${C.border}`,
          background: '#fff', color: value ? C.label : C.placeholder,
          fontSize: 12.5, fontWeight: 500, outline: 'none', cursor: 'pointer',
          appearance: 'none', fontFamily: 'inherit',
          boxShadow: '0 1px 4px rgba(10,124,110,0.06)',
          transition: 'border-color 0.2s',
        }}
        onFocus={e => e.target.style.borderColor = C.teal}
        onBlur={e => e.target.style.borderColor = C.border}
      >
        <option value="" style={{ color: C.placeholder }}>{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ color: C.label }}>{o.label}</option>
        ))}
      </select>
      <span style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        color: C.muted, fontSize: 10, pointerEvents: 'none',
      }}>▾</span>
    </div>
  );
}

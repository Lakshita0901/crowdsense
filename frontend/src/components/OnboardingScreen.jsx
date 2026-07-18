// src/components/OnboardingScreen.jsx
// Step 2 of 2 in the entry flow — ticket info + optional GPS.
// Same light Google-Maps-style design language as LandingScreen.
// No logic changes to the main app: just collects gate/section/GPS
// then calls onComplete() to hand off to the dashboard.

import React, { useState, useEffect, useRef } from 'react';

// ── Design tokens (identical to LandingScreen) ────────────────────────────────
const C = {
  blue:      '#1A73E8',
  blueDark:  '#1557B0',
  blueLight: '#E8F0FE',
  border:    '#DADCE0',
  textPri:   '#202124',
  textSec:   '#5F6368',
  textMuted: '#9AA0A6',
  surface:   '#F8F9FA',
  success:   '#137333',
  successBg: '#E6F4EA',
  warn:      '#7B5800',
  warnBg:    '#FEF9E7',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function OnboardingScreen({
  floorplan,
  // These are the same lifted-state setters used by FanChatPanel and StadiumMap
  selectedGate,    setSelectedGate,
  selectedSection, setSelectedSection,
  gpsLocation,     setGpsLocation,
  onComplete,
}) {
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError,   setGpsError]   = useState(null);
  const [exiting,    setExiting]    = useState(false);

  // Derived floorplan data — same pattern as FanChatPanel
  const gates    = floorplan?.gates    ?? [];
  const sections = floorplan?.sections ?? [];
  const filteredSections = selectedGate
    ? sections.filter(s => s.primary_gate === selectedGate)
    : sections;

  // Auto-reset section if gate changes and section no longer belongs
  useEffect(() => {
    if (selectedGate && selectedSection) {
      const sec = sections.find(s => s.id === selectedSection);
      if (sec && sec.primary_gate !== selectedGate) setSelectedSection('');
    }
  }, [selectedGate]);

  // GPS capture — same logic as FanChatPanel
  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Location not supported by this browser. Please select your gate manually.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    setGpsLocation(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGpsLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsLoading(false);
      },
      err => {
        console.warn('GPS error:', err.message);
        setGpsError(
          err.code === 1
            ? 'Location access denied — that\'s fine! Just use the dropdowns above and tap Continue.'
            : 'Could not get your location. Use the dropdowns above instead.',
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  };

  const clearGps = () => { setGpsLocation(null); setGpsError(null); };

  // Whether we have enough info to personalise (not required — fan can skip)
  const hasLocation = !!(gpsLocation || selectedGate || selectedSection);

  const handleContinue = () => {
    setExiting(true);
    setTimeout(onComplete, 360);
  };

  const gateLabel    = selectedGate    ? gates.find(g => g.id === selectedGate)?.name    : null;
  const sectionLabel = selectedSection ? sections.find(s => s.id === selectedSection)?.name : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: C.surface,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", system-ui, sans-serif',
        padding: '24px 16px',
        overflowY: 'auto',
        zIndex: 90,   // below LandingScreen (z:100) so transitions layer correctly
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 0.36s ease, transform 0.36s ease',
      }}
    >
      {/* ── Top: mini branding + step label ───────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 28, animation: 'fadeInUp 0.4s ease' }}>
        {/* Small logo mark */}
        <div style={{
          width: 44, height: 44, borderRadius: 14,
          background: `linear-gradient(135deg, ${C.blue} 0%, #4285F4 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px',
          boxShadow: `0 4px 16px rgba(26,115,232,0.25)`,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
          </svg>
        </div>

        {/* Step pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: C.blueLight, color: C.blue,
          borderRadius: 20, padding: '4px 12px',
          fontSize: 11, fontWeight: 700, marginBottom: 12,
          letterSpacing: '0.04em',
        }}>
          <StepDots active={1} />
          Step 2 of 2
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.textPri,
          letterSpacing: '-0.03em', margin: '0 0 6px', lineHeight: 1.2 }}>
          Find your seat 🎫
        </h2>
        <p style={{ fontSize: 13, color: C.textSec, margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
          Tell us where you are so CrowdSense AI can give you
          personalised directions from day one.
        </p>
      </div>

      {/* ── Main card ─────────────────────────────────────────────────────── */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#fff',
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        boxShadow: '0 4px 20px rgba(60,64,67,0.10), 0 1px 4px rgba(60,64,67,0.08)',
        overflow: 'hidden',
        animation: 'fadeInUp 0.50s ease',
        marginBottom: 16,
      }}>

        {/* ── Section A: Ticket info ─────────────────────────────────────── */}
        <div style={{ padding: '20px 20px 0' }}>
          <SectionLabel icon="🎟️" text="Your Ticket" />

          {/* Gate dropdown */}
          <div style={{ marginTop: 12 }}>
            <FieldLabel>Gate</FieldLabel>
            <StyledSelect
              value={selectedGate}
              onChange={e => setSelectedGate(e.target.value)}
              disabled={gates.length === 0}
              aria-label="Select your gate"
            >
              <option value="">Select your gate…</option>
              {gates.map(g => (
                <option key={g.id} value={g.id}>{g.name} — {g.direction}</option>
              ))}
            </StyledSelect>
          </div>

          {/* Section dropdown — filtered by gate */}
          <div style={{ marginTop: 10, marginBottom: 20 }}>
            <FieldLabel>Section</FieldLabel>
            <StyledSelect
              value={selectedSection}
              onChange={e => setSelectedSection(e.target.value)}
              disabled={filteredSections.length === 0}
              aria-label="Select your section"
            >
              <option value="">
                {selectedGate
                  ? filteredSections.length === 0 ? 'No sections for this gate' : 'Select your section…'
                  : 'Select a gate first…'}
              </option>
              {filteredSections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </StyledSelect>
            {selectedGate && filteredSections.length > 0 && (
              <p style={{ fontSize: 10, color: C.textMuted, margin: '5px 0 0' }}>
                Showing {filteredSections.length} section{filteredSections.length !== 1 ? 's' : ''} for {gateLabel}
              </p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.border }} />

        {/* ── Section B: GPS ────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 20px 20px' }}>
          <SectionLabel icon="📍" text="Live Location" optional />

          <p style={{ fontSize: 12, color: C.textSec, margin: '8px 0 14px', lineHeight: 1.5 }}>
            For real-time directions tailored to exactly where you are
            standing — even outdoors in the parking lot.
          </p>

          {/* GPS state: idle */}
          {!gpsLocation && !gpsLoading && !gpsError && (
            <GpsButton
              onClick={captureGps}
              label="Share my live location"
              icon="📡"
              variant="primary"
            />
          )}

          {/* GPS state: loading */}
          {gpsLoading && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 12,
              background: C.blueLight, border: `1px solid rgba(26,115,232,0.25)`,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `2.5px solid ${C.blue}`, borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite', flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: C.blue, fontWeight: 600 }}>
                Detecting your location…
              </span>
            </div>
          )}

          {/* GPS state: success */}
          {gpsLocation && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: 12,
                background: C.successBg, border: '1px solid #C6E8D2',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: C.success }}>
                      Location captured!
                    </div>
                    <div style={{ fontSize: 10.5, color: '#3D8B58', marginTop: 1 }}>
                      {gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)}
                      {gpsLocation.accuracy != null &&
                        ` · ±${Math.round(gpsLocation.accuracy)}m`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={clearGps}
                  style={{
                    fontSize: 10.5, fontWeight: 600, color: C.success,
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '2px 6px',
                    textDecoration: 'underline', opacity: 0.8,
                  }}
                >
                  Remove
                </button>
              </div>
              <p style={{ fontSize: 10, color: C.textMuted, margin: '6px 0 0', textAlign: 'center' }}>
                GPS accuracy improves outdoors. Inside, use Gate/Section.
              </p>
            </div>
          )}

          {/* GPS state: error / denied */}
          {gpsError && (
            <div>
              <div style={{
                padding: '12px 14px', borderRadius: 12,
                background: C.warnBg, border: '1px solid #E8D5A3',
                fontSize: 12, color: C.warn, lineHeight: 1.5,
              }}>
                <span style={{ fontWeight: 700 }}>📍 </span>
                {gpsError}
              </div>
              <button
                onClick={captureGps}
                aria-label="Try capturing GPS again"
                style={{
                  marginTop: 8, width: '100%', padding: '9px',
                  borderRadius: 10, border: `1px solid ${C.border}`,
                  background: '#fff', color: C.textSec,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Summary pill (shown when at least gate is set) ─────────────────── */}
      {hasLocation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 14px', borderRadius: 20,
          background: '#fff', border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(60,64,67,0.08)',
          fontSize: 11.5, fontWeight: 600, color: C.textPri,
          marginBottom: 14, animation: 'fadeInUp 0.3s ease',
        }}>
          <span>📍</span>
          {gpsLocation
            ? 'GPS location set'
            : [gateLabel, sectionLabel].filter(Boolean).join(' • ') || 'Location selected'
          }
          <span style={{ color: C.textMuted, fontWeight: 400 }}>·</span>
          <span style={{ color: C.blue, fontWeight: 700 }}>Ready</span>
        </div>
      )}

      {/* ── Primary CTA ────────────────────────────────────────────────────── */}
      <button
        id="btn-onboarding-continue"
        onClick={handleContinue}
        aria-label={hasLocation ? "Let's go" : "Open stadium assistant"}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', maxWidth: 360, padding: '14px 24px',
          borderRadius: 14, border: 'none',
          background: hasLocation
            ? `linear-gradient(135deg, ${C.blue} 0%, #4285F4 100%)`
            : C.blue,
          color: '#fff', fontSize: 14.5, fontWeight: 700,
          cursor: 'pointer',
          boxShadow: `0 4px 16px rgba(26,115,232,0.30)`,
          transition: 'all 0.18s ease',
          animation: 'fadeInUp 0.60s ease',
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 8px 24px rgba(26,115,232,0.38)`;
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = `0 4px 16px rgba(26,115,232,0.30)`;
        }}
      >
        {hasLocation ? (
          <>
            <span>🏟️</span>
            Let's go!
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
            </svg>
          </>
        ) : (
          <>Open stadium assistant →</>
        )}
      </button>

      {/* Skip link */}
      {!hasLocation && (
        <button
          onClick={handleContinue}
          aria-label="Skip location setup for now"
          style={{
            marginTop: 12, background: 'none', border: 'none',
            fontSize: 12, color: C.textMuted, cursor: 'pointer',
            textDecoration: 'underline', padding: '4px 8px',
          }}
        >
          Skip for now — I'll set my location later
        </button>
      )}
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────

function StepDots({ active }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {[0, 1].map(i => (
        <span key={i} style={{
          width: i === active ? 14 : 6, height: 6, borderRadius: 3,
          background: i === active ? '#1A73E8' : 'rgba(26,115,232,0.30)',
          transition: 'width 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function SectionLabel({ icon, text, optional }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#5F6368',
        textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {text}
      </span>
      {optional && (
        <span style={{
          fontSize: 9.5, fontWeight: 600, color: '#9AA0A6',
          background: '#F1F3F4', borderRadius: 10, padding: '1px 7px',
          letterSpacing: '0.04em',
        }}>
          OPTIONAL
        </span>
      )}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: '#5F6368',
      marginBottom: 5, letterSpacing: '0.03em',
    }}>
      {children}
    </label>
  );
}

function StyledSelect({ children, value, onChange, disabled, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%', padding: '10px 32px 10px 12px',
          borderRadius: 10,
          border: `1.5px solid ${focused ? '#1A73E8' : '#DADCE0'}`,
          background: disabled ? '#F8F9FA' : '#fff',
          color: value ? '#202124' : '#9AA0A6',
          fontSize: 13, fontWeight: value ? 500 : 400,
          outline: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          appearance: 'none',
          transition: 'border-color 0.15s ease',
          boxShadow: focused ? '0 0 0 3px rgba(26,115,232,0.12)' : 'none',
        }}
        {...rest}
      >
        {children}
      </select>
      <span style={{
        position: 'absolute', right: 10, top: '50%',
        transform: 'translateY(-50%)',
        color: '#9AA0A6', fontSize: 11, pointerEvents: 'none',
      }}>▾</span>
    </div>
  );
}

function GpsButton({ onClick, label, icon, variant }) {
  const [hovered, setHovered] = useState(false);
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      style={{
        width: '100%', padding: '12px 16px',
        borderRadius: 12, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontWeight: 700, fontSize: 13,
        transition: 'all 0.18s ease',
        border: `1.5px solid ${isPrimary ? '#1A73E8' : '#DADCE0'}`,
        background: isPrimary
          ? (hovered ? 'rgba(26,115,232,0.08)' : '#E8F0FE')
          : (hovered ? '#F8F9FA' : '#fff'),
        color: isPrimary ? '#1A73E8' : '#202124',
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? '0 3px 10px rgba(26,115,232,0.15)' : 'none',
      }}
    >
      <span style={{ fontSize: 17 }}>{icon}</span>
      {label}
    </button>
  );
}

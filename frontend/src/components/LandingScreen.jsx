// src/components/LandingScreen.jsx
// FIFA World Cup 2026 — CrowdSense AI welcome / landing screen.
// Light Google-Maps-style design: white background, one blue accent,
// a realistic live match scoreboard, and an "Enter Stadium" CTA.

import React, { useState, useEffect } from 'react';

// ── Mock match data ────────────────────────────────────────────────────────────
// Mirrors crowd_density.json meta so the branding feels consistent.
const MATCH = {
  competition: 'FIFA World Cup 2026™',
  round:       'Final',
  venue:       'MetLife Stadium, East Rutherford NJ',
  date:        'July 19, 2026',
  home: {
    name:  'Argentina',
    code:  'ARG',
    flag:  '🇦🇷',
    score: 2,
    // primary kit colour used for accent stripe
    color: '#74ACDF',
  },
  away: {
    name:  'France',
    code:  'FRA',
    flag:  '🇫🇷',
    score: 1,
    color: '#002395',
  },
  // Stats shown beneath the scoreboard
  stats: [
    { label: 'Possession',     home: '54%',  away: '46%' },
    { label: 'Shots on Target',home: '6',    away: '4'   },
    { label: 'Corners',        home: '5',    away: '3'   },
    { label: 'Yellow Cards',   home: '1',    away: '2'   },
  ],
};

// Palette — same tokens used across the rest of the app
const C = {
  blue:       '#1A73E8',
  blueLight:  '#E8F0FE',
  blueDark:   '#1557B0',
  border:     '#DADCE0',
  textPri:    '#202124',
  textSec:    '#5F6368',
  textMuted:  '#9AA0A6',
  surface:    '#F8F9FA',
  live:       '#EA4335',     // Google red — used for LIVE badge only
  liveLight:  '#FCE8E6',
  gold:       '#FBBC04',
};

// ── Landing Screen component ───────────────────────────────────────────────────
export default function LandingScreen({ onEnter }) {
  // Match clock ticks +1 every 12 s in demo mode to look alive
  const [minute, setMinute]   = useState(73);
  const [seconds, setSeconds] = useState(22);
  const [entered, setEntered] = useState(false);  // for exit animation

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(s => {
        if (s >= 59) { setMinute(m => Math.min(m + 1, 90)); return 0; }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const handleEnter = () => {
    setEntered(true);
    setTimeout(onEnter, 380);   // wait for fade-out before switching
  };

  const pad = n => String(n).padStart(2, '0');

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: C.surface,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
        padding: '24px 16px',
        gap: 0,
        opacity: entered ? 0 : 1,
        transform: entered ? 'scale(0.98)' : 'scale(1)',
        transition: 'opacity 0.38s ease, transform 0.38s ease',
        overflowY: 'auto',
        zIndex: 100,
      }}
    >
      {/* ── Brand header ──────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 32, animation: 'fadeInUp 0.5s ease' }}>
        {/* Logo mark */}
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: `linear-gradient(135deg, ${C.blue} 0%, #4285F4 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
          boxShadow: `0 8px 24px rgba(26,115,232,0.30)`,
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
          </svg>
        </div>

        {/* App name */}
        <div style={{ fontSize: 28, fontWeight: 800, color: C.textPri, letterSpacing: '-0.03em', lineHeight: 1 }}>
          Crowd<span style={{
            background: `linear-gradient(135deg, ${C.blue}, #4285F4)`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>Sense</span> AI
        </div>
        <div style={{ fontSize: 13, color: C.textSec, marginTop: 6, fontWeight: 500 }}>
          Your FIFA World Cup 2026 Stadium Assistant
        </div>
      </div>

      {/* ── Live match card ────────────────────────────────────────────────── */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#fff',
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        boxShadow: '0 4px 20px rgba(60,64,67,0.12), 0 1px 4px rgba(60,64,67,0.08)',
        overflow: 'hidden',
        animation: 'fadeInUp 0.55s ease',
        marginBottom: 20,
      }}>
        {/* Card top bar — competition + venue */}
        <div style={{
          background: `linear-gradient(135deg, ${C.blue} 0%, #4285F4 100%)`,
          padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {MATCH.competition} · {MATCH.round}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2 }}>
              {MATCH.venue}
            </div>
          </div>
          {/* LIVE badge */}
          <LiveBadge />
        </div>

        {/* Scoreboard */}
        <div style={{ padding: '24px 18px 18px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center', gap: 8,
          }}>
            {/* Home team */}
            <TeamBlock team={MATCH.home} align="left" />

            {/* Score + clock */}
            <div style={{ textAlign: 'center', minWidth: 80 }}>
              {/* Score */}
              <div style={{
                fontSize: 44, fontWeight: 900, color: C.textPri,
                letterSpacing: '-0.04em', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {MATCH.home.score}
                <span style={{ color: C.textMuted, margin: '0 4px', fontSize: 36 }}>–</span>
                {MATCH.away.score}
              </div>
              {/* Match clock */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                marginTop: 6,
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: C.live, display: 'inline-block',
                  animation: 'livePulse 1.4s ease-in-out infinite',
                }} />
                <span style={{
                  fontSize: 12, fontWeight: 700, color: C.live,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {minute}'{pad(seconds)}"
                </span>
              </div>
            </div>

            {/* Away team */}
            <TeamBlock team={MATCH.away} align="right" />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: C.border, margin: '18px 0 14px' }} />

          {/* Match stats table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MATCH.stats.map(stat => (
              <StatRow key={stat.label} stat={stat} />
            ))}
          </div>
        </div>

        {/* Card footer */}
        <div style={{
          background: C.surface, borderTop: `1px solid ${C.border}`,
          padding: '9px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>
            📅 {MATCH.date} · Kickoff 20:00 ET
          </span>
        </div>
      </div>

      {/* ── Stadium capacity teaser ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 28,
        animation: 'fadeInUp 0.65s ease',
      }}>
        {[
          { icon: '👥', value: '33,415', label: 'Fans inside' },
          { icon: '🚪', value: '1',      label: 'Critical gate' },
          { icon: '⏱',  value: 'LIVE',   label: 'Density feed' },
        ].map(chip => (
          <div key={chip.label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: '#fff', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '8px 14px', gap: 2,
            boxShadow: '0 1px 3px rgba(60,64,67,0.10)',
          }}>
            <span style={{ fontSize: 16 }}>{chip.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textPri }}>{chip.value}</span>
            <span style={{ fontSize: 9.5, color: C.textMuted, textTransform: 'uppercase',
              letterSpacing: '0.06em' }}>{chip.label}</span>
          </div>
        ))}
      </div>

      {/* ── Enter Stadium CTA ──────────────────────────────────────────────── */}
      <button
        id="btn-enter-stadium"
        onClick={handleEnter}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          width: '100%', maxWidth: 320,
          padding: '15px 28px',
          borderRadius: 14, border: 'none',
          background: `linear-gradient(135deg, ${C.blue} 0%, #4285F4 100%)`,
          color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em',
          cursor: 'pointer',
          boxShadow: `0 6px 20px rgba(26,115,232,0.35)`,
          transition: 'all 0.18s ease',
          animation: 'fadeInUp 0.75s ease',
        }}
        onMouseOver={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = `0 10px 28px rgba(26,115,232,0.40)`;
        }}
        onMouseOut={e => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = `0 6px 20px rgba(26,115,232,0.35)`;
        }}
      >
        <span style={{ fontSize: 18 }}>🏟️</span>
        Enter Stadium
        <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
        </svg>
      </button>

      {/* Subtext */}
      <p style={{ marginTop: 12, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
        Live crowd density · AI navigation · 5 languages
      </p>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(255,255,255,0.18)',
      border: '1px solid rgba(255,255,255,0.30)',
      borderRadius: 20, padding: '4px 10px',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: '#fff',
        animation: 'livePulse 1.4s ease-in-out infinite',
        display: 'inline-block',
      }} />
      <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: '0.08em' }}>
        LIVE
      </span>
    </div>
  );
}

function TeamBlock({ team, align }) {
  const isLeft = align === 'left';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isLeft ? 'flex-start' : 'flex-end',
      gap: 4,
    }}>
      {/* Flag */}
      <span style={{ fontSize: 30, lineHeight: 1 }}>{team.flag}</span>
      {/* Full name */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: '#202124',
        textAlign: isLeft ? 'left' : 'right', lineHeight: 1.2,
      }}>
        {team.name}
      </div>
      {/* Code badge */}
      <span style={{
        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
        color: '#5F6368', textTransform: 'uppercase',
      }}>
        {team.code}
      </span>
      {/* Kit colour stripe */}
      <div style={{
        height: 3, width: 28, borderRadius: 2,
        background: team.color, opacity: 0.8,
      }} />
    </div>
  );
}

function StatRow({ stat }) {
  // Parse numeric values for the bar widths
  const parseVal = v => {
    const n = parseFloat(v.replace('%', ''));
    return isNaN(n) ? 0 : n;
  };
  const hv = parseVal(stat.home);
  const av = parseVal(stat.away);
  const total = hv + av || 1;
  const homePct = (hv / total) * 100;

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#202124', minWidth: 28 }}>
          {stat.home}
        </span>
        <span style={{ fontSize: 10, color: '#9AA0A6', textAlign: 'center', flex: 1 }}>
          {stat.label}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#202124', minWidth: 28, textAlign: 'right' }}>
          {stat.away}
        </span>
      </div>
      {/* Dual progress bar */}
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 1 }}>
        <div style={{
          flex: homePct, background: MATCH.home.color,
          borderRadius: '2px 0 0 2px', transition: 'flex 0.6s ease',
        }} />
        <div style={{
          flex: 100 - homePct, background: MATCH.away.color,
          borderRadius: '0 2px 2px 0', transition: 'flex 0.6s ease',
        }} />
      </div>
    </div>
  );
}

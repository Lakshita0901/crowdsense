// src/components/MatchBar.jsx
// Persistent slim live-match status strip.
// Uses the same mock data as LandingScreen — ticks the clock
// in real-time so it always feels alive.

import React, { useState, useEffect } from 'react';

const MATCH = {
  home: { name: 'Argentina', code: 'ARG', flag: '🇦🇷', score: 2, color: '#74ACDF' },
  away: { name: 'France',    code: 'FRA', flag: '🇫🇷', score: 1, color: '#002395' },
};

export default function MatchBar() {
  const [minute, setMinute]   = useState(73);
  const [seconds, setSeconds] = useState(22);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(s => {
        if (s >= 59) { setMinute(m => Math.min(m + 1, 90)); return 0; }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const pad = n => String(n).padStart(2, '0');

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '5px 16px',
        background: '#fff',
        borderBottom: '1px solid #E8EAED',
        fontFamily: '"Inter", system-ui, sans-serif',
        flexShrink: 0,
        minHeight: 32,
      }}
    >
      {/* LIVE dot */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        background: '#FCE8E6', borderRadius: 10, padding: '2px 8px',
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: '#EA4335',
          display: 'inline-block',
          animation: 'livePulse 1.4s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 9, fontWeight: 800, color: '#EA4335', letterSpacing: '0.06em' }}>
          LIVE
        </span>
      </div>

      {/* Home team */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 13 }}>{MATCH.home.flag}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#202124' }}>{MATCH.home.code}</span>
      </div>

      {/* Score */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: '#202124' }}>{MATCH.home.score}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#9AA0A6' }}>–</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: '#202124' }}>{MATCH.away.score}</span>
      </div>

      {/* Away team */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#202124' }}>{MATCH.away.code}</span>
        <span style={{ fontSize: 13 }}>{MATCH.away.flag}</span>
      </div>

      {/* Clock */}
      <span style={{
        fontSize: 10, fontWeight: 700, color: '#5F6368',
        fontVariantNumeric: 'tabular-nums',
        background: '#F1F3F4', borderRadius: 6, padding: '2px 7px',
      }}>
        {minute}'{pad(seconds)}"
      </span>
    </div>
  );
}

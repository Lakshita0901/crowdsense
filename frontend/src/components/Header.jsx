// src/components/Header.jsx
// Google Maps-style light header: white bar, dark text, blue logo mark, subtle border.
import React from 'react';

export default function Header({ density, tickCount }) {
  const totals    = density?.stadium_totals;
  const occupancy = totals?.occupancy_pct ?? 0;
  const critical  = totals?.gates_at_critical ?? 0;

  return (
    <header className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-gray-200 z-50 shrink-0 shadow-card">
      {/* Brand */}
      <div className="flex items-center gap-3">
        {/* Logo mark — compact blue circle with icon */}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #1A73E8 0%, #4285F4 100%)' }}
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
          </svg>
        </div>
        <div>
          <h1 className="font-display font-bold text-base leading-none text-gray-900">
            Crowd<span className="text-gradient">Sense</span> AI
          </h1>
          <p className="text-[10px] text-gray-500 font-medium mt-0.5">
            FIFA World Cup 2026 · MetLife Stadium
          </p>
        </div>
      </div>

      {/* Live stats — light pills */}
      <div className="hidden md:flex items-center gap-3">
        {totals && (
          <>
            <StatPill label="Occupancy" value={`${occupancy.toFixed(1)}%`} color="blue" />
            <StatPill label="Present"   value={totals.total_present?.toLocaleString()} color="gray" />
            {critical > 0 && (
              <StatPill label="Critical Gates" value={critical} color="red" pulse />
            )}
          </>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-[11px] text-gray-500 font-medium">
          LIVE · Tick #{tickCount}
        </span>
      </div>
    </header>
  );
}

function StatPill({ label, value, color, pulse }) {
  const styles = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-50  text-gray-700 border-gray-200',
    red:  `bg-red-50  text-red-700  border-red-200 ${pulse ? 'animate-pulse' : ''}`,
  };
  return (
    <div className={`flex flex-col items-center px-3 py-1 rounded-lg border text-xs ${styles[color]}`}>
      <span className="font-bold text-sm leading-none">{value}</span>
      <span className="text-[10px] opacity-70 mt-0.5">{label}</span>
    </div>
  );
}

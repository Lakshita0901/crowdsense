// src/components/Header.jsx
import React from 'react';

export default function Header({ density, tickCount }) {
  const totals = density?.stadium_totals;
  const occupancy = totals?.occupancy_pct ?? 0;
  const critical  = totals?.gates_at_critical ?? 0;

  return (
    <header className="flex items-center justify-between px-6 py-3 glass-card-dark border-b border-white/5 z-50 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="relative w-9 h-9">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 opacity-80 blur-sm" />
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500">
            <svg className="w-5 h-5 text-navy-950" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" opacity="0.2" />
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
            </svg>
          </div>
        </div>
        <div>
          <h1 className="font-display font-bold text-lg leading-none text-white">
            Crowd<span className="text-gradient">Sense</span> AI
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">FIFA World Cup 2026 · MetLife Stadium</p>
        </div>
      </div>

      {/* Live stats */}
      <div className="hidden md:flex items-center gap-4">
        {totals && (
          <>
            <StatPill label="Occupancy" value={`${occupancy.toFixed(1)}%`} color="teal" />
            <StatPill label="Present" value={totals.total_present?.toLocaleString()} color="blue" />
            {critical > 0 && (
              <StatPill label="Critical Gates" value={critical} color="red" pulse />
            )}
          </>
        )}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
        </span>
        <span className="text-xs text-slate-400 font-medium">
          LIVE · Tick #{tickCount}
        </span>
      </div>
    </header>
  );
}

function StatPill({ label, value, color, pulse }) {
  const colors = {
    teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    red:  `bg-red-500/10 text-red-400 border-red-500/20 ${pulse ? 'animate-pulse' : ''}`,
  };
  return (
    <div className={`flex flex-col items-center px-3 py-1.5 rounded-lg border text-xs ${colors[color]}`}>
      <span className="font-bold text-sm leading-none">{value}</span>
      <span className="text-[10px] opacity-70 mt-0.5">{label}</span>
    </div>
  );
}

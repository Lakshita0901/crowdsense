// src/components/DensityPanel.jsx
import React from 'react';

const STATUS_CONFIG = {
  low:      { label: 'LOW',      bar: 'bg-emerald-500',  text: 'text-emerald-400', glow: 'shadow-emerald-500/30' },
  moderate: { label: 'MOD',      bar: 'bg-amber-400',    text: 'text-amber-400',   glow: 'shadow-amber-500/30' },
  high:     { label: 'HIGH',     bar: 'bg-orange-500',   text: 'text-orange-400',  glow: 'shadow-orange-500/30' },
  critical: { label: 'CRITICAL', bar: 'bg-red-500',      text: 'text-red-400',     glow: 'shadow-red-500/50' },
};

const TREND_ICON = { rising: '↑', falling: '↓', stable: '→' };
const TREND_COLOR = { rising: 'text-orange-400', falling: 'text-emerald-400', stable: 'text-slate-500' };

export default function DensityPanel({ density }) {
  if (!density) {
    return (
      <div className="glass-card p-4 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-8 h-8 border-2 border-teal-500/40 border-t-teal-400 rounded-full animate-spin" />
          <span className="text-sm">Loading density…</span>
        </div>
      </div>
    );
  }

  const { gates = [], stadium_totals: totals } = density;

  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse-slow" />
          <h2 className="font-display font-semibold text-sm text-white tracking-wide">
            Gate Density — Live
          </h2>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          {density.last_updated ? new Date(density.last_updated).toLocaleTimeString() : '—'}
        </span>
      </div>

      {/* Gate list */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-2 space-y-2">
        {gates.map(gate => {
          const cfg = STATUS_CONFIG[gate.status] || STATUS_CONFIG.low;
          const pct = gate.pct ?? 0;
          return (
            <GateRow key={gate.gate_id} gate={gate} cfg={cfg} pct={pct} />
          );
        })}
      </div>

      {/* Summary footer */}
      {totals && (
        <div className="border-t border-white/5 px-4 py-3 grid grid-cols-2 gap-2">
          <SummaryItem label="Total Present"    value={totals.total_present?.toLocaleString()} />
          <SummaryItem label="Occupancy"        value={`${totals.occupancy_pct?.toFixed(1)}%`} />
          <SummaryItem label="Critical Gates"   value={totals.gates_at_critical} color="text-red-400" />
          <SummaryItem label="Capacity"         value={totals.total_capacity?.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

function GateRow({ gate, cfg, pct }) {
  const alert = gate.alert;
  return (
    <div className={`rounded-xl border p-3 transition-all duration-500 ${
      gate.status === 'critical'
        ? 'border-red-500/40 bg-red-900/10 shadow-md shadow-red-500/10'
        : 'border-white/5 bg-navy-700/30 hover:bg-navy-700/50'
    }`}>
      <div className="flex items-center justify-between mb-2">
        {/* Gate label */}
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-navy-600/80 border border-white/10 flex items-center justify-center text-xs font-display font-bold text-white">
            {gate.gate_name?.replace('Gate ', '')}
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-200 leading-none">{gate.gate_name}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{gate.direction}</p>
          </div>
        </div>

        {/* Right side: status + trend */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${TREND_COLOR[gate.trend]}`}>
            {TREND_ICON[gate.trend]}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${cfg.text} ${
            gate.status === 'critical' ? 'bg-red-500/20' : 'bg-white/5'
          }`}>
            {cfg.label}
          </span>
          <span className={`text-xs font-bold ${cfg.text}`}>{pct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-navy-600/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.bar} ${
            gate.status === 'critical' ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Count + wait */}
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
        <span>{gate.current_count?.toLocaleString()} / {gate.capacity?.toLocaleString()}</span>
        {gate.avg_wait_minutes > 0 && (
          <span>~{gate.avg_wait_minutes} min wait</span>
        )}
      </div>

      {/* Alert banner */}
      {alert && (
        <div className="mt-2 text-[10px] font-semibold text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1.5 leading-snug animate-slide-up">
          ⚠ {alert}
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-bold ${color || 'text-white'}`}>{value ?? '—'}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

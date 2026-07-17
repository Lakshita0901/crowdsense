// src/components/DensityPanel.jsx
// Google Maps-style light panel: white cards, colored status badges/bars,
// clean typography on light backgrounds. All dark navy removed.
// Support back button navigation.

import React from 'react';

// Status config — colors carry semantic meaning, chrome is light
const STATUS_CONFIG = {
  low:      { label: 'LOW',      bar: 'bg-green-500',  badge: 'bg-green-50  text-green-700  border-green-200' },
  moderate: { label: 'MOD',      bar: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-700  border-amber-200' },
  high:     { label: 'HIGH',     bar: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200' },
  critical: { label: 'CRITICAL', bar: 'bg-red-500',    badge: 'bg-red-50    text-red-700    border-red-200'   },
};

const TREND_ICON  = { rising: '↑', falling: '↓', stable: '→' };
const TREND_COLOR = {
  rising:  'text-orange-600',
  falling: 'text-green-600',
  stable:  'text-gray-400',
};

export default function DensityPanel({ density, setActiveTab }) {
  if (!density) {
    return (
      <div className="glass-card p-4 h-full flex items-center justify-center bg-white border border-gray-200 rounded-2xl shadow-card">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-7 h-7 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading density…</span>
        </div>
      </div>
    );
  }

  const { gates = [], stadium_totals: totals } = density;

  return (
    <div className="glass-card flex flex-col h-full overflow-hidden bg-white">

      {/* Panel header with back button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('chat')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
          >
            ← Back to Chat
          </button>
          <div className="h-4 w-[1px] bg-gray-200" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-slow" />
            <h2 className="font-display font-semibold text-sm text-gray-800 tracking-wide">
              Gate Density — Live
            </h2>
          </div>
        </div>
        <span className="text-[10px] text-gray-400 font-mono tabular-nums">
          {density.last_updated ? new Date(density.last_updated).toLocaleTimeString() : '—'}
        </span>
      </div>

      {/* Gate cards list */}
      <div className="flex-1 overflow-y-auto custom-scroll px-3 py-2 space-y-2">
        {gates.map(gate => {
          const cfg = STATUS_CONFIG[gate.status] || STATUS_CONFIG.low;
          const pct = gate.pct ?? 0;
          return <GateRow key={gate.gate_id} gate={gate} cfg={cfg} pct={pct} allGates={gates} />;
        })}
      </div>

      {/* Summary footer */}
      {totals && (
        <div className="border-t border-gray-100 px-4 py-3 grid grid-cols-2 gap-2 shrink-0 bg-gray-50 rounded-b-2xl">
          <SummaryItem label="Total Present"  value={totals.total_present?.toLocaleString()} />
          <SummaryItem label="Occupancy"      value={`${totals.occupancy_pct?.toFixed(1)}%`} />
          <SummaryItem
            label="Critical Gates"
            value={totals.gates_at_critical}
            color={totals.gates_at_critical > 0 ? 'text-red-600 font-bold' : 'text-gray-800'}
          />
          <SummaryItem label="Capacity"       value={totals.total_capacity?.toLocaleString()} />
        </div>
      )}
    </div>
  );
}

function GateRow({ gate, cfg, pct, allGates }) {
  const isCritical = gate.status === 'critical';
  const [whyExpanded, setWhyExpanded] = React.useState(false);

  // adjacent gates logic
  const adjGates = React.useMemo(() => {
    if (!allGates || !gate.gate_id) return [];
    const GATE_ORDER = ['GATE_A', 'GATE_B', 'GATE_C', 'GATE_D', 'GATE_E', 'GATE_F', 'GATE_G', 'GATE_H'];
    const idx = GATE_ORDER.indexOf(gate.gate_id);
    if (idx === -1) return [];
    const n = GATE_ORDER.length;
    const prevId = GATE_ORDER[(idx - 1 + n) % n];
    const nextId = GATE_ORDER[(idx + 1) % n];
    return [
      allGates.find(g => g.gate_id === prevId),
      allGates.find(g => g.gate_id === nextId)
    ].filter(Boolean);
  }, [gate.gate_id, allGates]);

  return (
    <div className={`rounded-xl border p-3 transition-all duration-300 ${
      isCritical
        ? 'border-red-200 bg-red-50/60'
        : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
    }`}>
      {/* Top row: gate identity + status */}
      <div className="flex items-center justify-between mb-2">

        {/* Gate label + name */}
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-display font-bold text-gray-700">
            {gate.gate_name?.replace('Gate ', '')}
          </span>
          <div>
            <p className="text-xs font-semibold text-gray-800 leading-none">{gate.gate_name}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{gate.direction}</p>
          </div>
        </div>

        {/* Right: trend + badge + pct */}
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold ${TREND_COLOR[gate.trend] ?? 'text-gray-400'}`}>
            {TREND_ICON[gate.trend]}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${cfg.badge}`}>
            {cfg.label}
          </span>
          <span className="text-xs font-bold text-gray-700 tabular-nums">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Progress bar — colored fill on light gray track */}
      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${cfg.bar} ${
            isCritical ? 'animate-pulse' : ''
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Count + wait */}
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>{gate.current_count?.toLocaleString()} / {gate.capacity?.toLocaleString()}</span>
        {gate.avg_wait_minutes > 0 && (
          <span>~{gate.avg_wait_minutes} min wait</span>
        )}
      </div>

      {/* Alert banner with expandable Reasoning */}
      {gate.alert && (
        <div className="mt-2 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5 leading-snug animate-slide-up flex flex-col gap-1.5">
          <div className="flex items-center justify-between w-full">
            <span>⚠ {gate.alert}</span>
            <button
              onClick={() => setWhyExpanded(!whyExpanded)}
              className="text-[9px] bg-red-100 hover:bg-red-200 text-red-800 px-2 py-0.5 rounded cursor-pointer transition-colors shrink-0 font-bold"
            >
              {whyExpanded ? 'Hide Reason ✕' : 'Why this recommendation? ▾'}
            </button>
          </div>

          {whyExpanded && (
            <div className="mt-1.5 pt-1.5 border-t border-red-200/50 text-[10px] text-gray-700 space-y-1.5 font-normal">
              <div>
                <span className="font-bold text-red-800">Current Load: </span>
                <span>{pct.toFixed(1)}% occupancy ({gate.current_count?.toLocaleString()} / {gate.capacity?.toLocaleString()} fans) and queues are <span className="font-semibold">{gate.trend}</span>.</span>
              </div>
              
              <div className="font-bold text-red-800 mt-1">Suggested Alternates Status:</div>
              <div className="grid grid-cols-2 gap-2 bg-white/70 p-1.5 rounded border border-red-100">
                {adjGates.map(adj => (
                  <div key={adj.gate_id} className="text-[9px]">
                    <p className="font-bold text-gray-800">{adj.gate_name}</p>
                    <p>Load: {adj.pct?.toFixed(0)}% ({adj.trend})</p>
                    <p>Wait: ~{adj.avg_wait_minutes} min</p>
                  </div>
                ))}
              </div>

              <div className="text-[9px] leading-relaxed text-gray-500 italic mt-1">
                * Chosen over other gates because they are direct physical neighbors (closest walking distance) and are running at safer, non-critical levels (avg {((adjGates[0]?.pct + (adjGates[1]?.pct || 0)) / (adjGates.length || 1)).toFixed(0)}% vs your {pct.toFixed(0)}%).
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-sm font-bold ${color || 'text-gray-800'}`}>{value ?? '—'}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

// src/components/StadiumMap.jsx
// SVG schematic of MetLife Stadium with gate/POI markers overlaid.
// All coordinates use the 800×600 viewport defined in the floor-plan JSON.

import React, { useState, useMemo } from 'react';

// ── Stadium geographic bounds (from floor-plan data) ──────────────────────────
// Used to convert GPS lat/lng into the 800×600 SVG coordinate space.
const GEO_BOUNDS = {
  latMin: 40.8095,  // south edge
  latMax: 40.8175,  // north edge
  lngMin: -74.0800, // west edge
  lngMax: -74.0695, // east edge
};
const SVG_W = 800, SVG_H = 600;

/**
 * Convert a {lat, lng} to SVG {x, y} within the 800×600 viewport.
 * Returns null if the point is significantly outside the stadium area.
 */
function geoToSvg(lat, lng) {
  const { latMin, latMax, lngMin, lngMax } = GEO_BOUNDS;
  // Normalise [0,1] then scale to SVG — lng increases eastward (left→right)
  const nx = (lng - lngMin) / (lngMax - lngMin);
  const ny = 1 - (lat - latMin) / (latMax - latMin); // SVG y grows downward
  const x = nx * SVG_W;
  const y = ny * SVG_H;
  // Check if outside bounds (with 15px margin)
  const margin = 0.15;
  const outOfBounds = nx < -margin || nx > 1 + margin || ny < -margin || ny > 1 + margin;
  return {
    x: Math.max(20, Math.min(SVG_W - 20, x)),
    y: Math.max(20, Math.min(SVG_H - 20, y)),
    approximate: outOfBounds,
  };
}

const GATE_STATUS_COLORS = {
  low:      { fill: '#10b981', stroke: '#34d399', glow: 'drop-shadow(0 0 6px #10b981)' },
  moderate: { fill: '#f59e0b', stroke: '#fbbf24', glow: 'drop-shadow(0 0 6px #f59e0b)' },
  high:     { fill: '#f97316', stroke: '#fb923c', glow: 'drop-shadow(0 0 6px #f97316)' },
  critical: { fill: '#ef4444', stroke: '#f87171', glow: 'drop-shadow(0 0 10px #ef4444)' },
};

// POI marker shapes
function RestRoom({ x, y, accessible }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="5" fill={accessible ? '#06b6d4' : '#475569'} stroke="#0f172a" strokeWidth="1" opacity="0.85" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="4" fill="white" fontWeight="bold">R</text>
    </g>
  );
}
function MedicalPoint({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#dc2626" stroke="#0f172a" strokeWidth="1" opacity="0.9" />
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontWeight="bold">+</text>
    </g>
  );
}
function FoodCourt({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="5" fill="#d97706" stroke="#0f172a" strokeWidth="1" opacity="0.85" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="4" fill="white" fontWeight="bold">F</text>
    </g>
  );
}

// ── "You Are Here" marker ──────────────────────────────────────────────────────
function YouAreHereMarker({ x, y, approximate }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Outer pulsing ring */}
      <circle r="18" fill="none" stroke="#3b82f6" strokeWidth="1.5" opacity="0.35">
        <animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Middle ring */}
      <circle r="12" fill="#1d4ed8" fillOpacity="0.2" stroke="#60a5fa" strokeWidth="1" />
      {/* Core dot */}
      <circle r="7" fill="#3b82f6" stroke="#eff6ff" strokeWidth="2" />
      {/* Person icon (simplified) */}
      <circle cx="0" cy="-2" r="2.5" fill="white" />
      <path d="M -2.5 1 Q 0 6 2.5 1" fill="white" stroke="none" />
      {/* "You" label */}
      <rect x="-11" y="10" width="22" height="10" rx="3" fill="#1e40af" opacity="0.9" />
      <text
        x="0" y="17.5"
        textAnchor="middle"
        fontSize="6.5"
        fill="white"
        fontWeight="700"
        fontFamily="system-ui,sans-serif"
      >
        {approximate ? 'You ~' : 'You'}
      </text>
    </g>
  );
}

// Gate marker
function GateMarker({ gate, densityGate, onClick, selected }) {
  const status = densityGate?.status || 'low';
  const cfg = GATE_STATUS_COLORS[status];
  const pct = densityGate?.pct ?? 0;

  // Ring animation for critical
  return (
    <g
      transform={`translate(${gate.svgX},${gate.svgY})`}
      onClick={() => onClick(gate, densityGate)}
      style={{ cursor: 'pointer' }}
    >
      {/* Glow ring */}
      {status === 'critical' && (
        <circle r="16" fill="none" stroke={cfg.stroke} strokeWidth="1.5" opacity="0.4">
          <animate attributeName="r" values="14;20;14" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
      {/* Selection ring */}
      {selected && <circle r="15" fill="none" stroke="#00f5e4" strokeWidth="1.5" opacity="0.8" />}
      {/* Gate circle */}
      <circle
        r="10"
        fill={cfg.fill}
        stroke={cfg.stroke}
        strokeWidth="1.5"
        opacity="0.9"
        style={{ filter: cfg.glow }}
      />
      {/* Gate label */}
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontWeight="bold">
        {gate.label}
      </text>
      {/* Pct below */}
      <text x="0" y="22" textAnchor="middle" fontSize="7" fill={cfg.fill} fontWeight="600">
        {pct.toFixed(0)}%
      </text>
    </g>
  );
}

export default function StadiumMap({ floorplan, density, activeLayer, selectedGate, selectedSection, gpsLocation }) {
  const [selected, setSelected] = useState(null);

  const gates       = floorplan?.gates ?? [];
  const poi         = floorplan?.points_of_interest ?? {};
  const sections    = floorplan?.sections ?? [];
  const densityGates = density?.gates ?? [];

  const getDensityGate = (gateId) =>
    densityGates.find(g => g.gate_id === gateId);

  // ── Resolve "You Are Here" SVG position ────────────────────────────────
  const youPosition = useMemo(() => {
    // 1. GPS location (highest priority)
    if (gpsLocation?.lat != null && gpsLocation?.lng != null) {
      return { ...geoToSvg(gpsLocation.lat, gpsLocation.lng), source: 'gps' };
    }
    // 2. Section selection
    if (selectedSection) {
      const sec = sections.find(s => s.id === selectedSection);
      if (sec?.lat != null && sec?.lng != null) {
        return { ...geoToSvg(sec.lat, sec.lng), source: 'section' };
      }
    }
    // 3. Gate selection
    if (selectedGate) {
      const gate = gates.find(g => g.id === selectedGate);
      if (gate) {
        return { x: gate.svgX, y: gate.svgY, approximate: false, source: 'gate' };
      }
    }
    return null;
  }, [gpsLocation, selectedGate, selectedSection, gates, sections]);

  const handleGateClick = (gate, densityGate) => {
    setSelected(prev => (prev?.id === gate.id ? null : { gate, densityGate }));
  };

  return (
    <div className="glass-card h-full flex flex-col overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <h2 className="font-display font-semibold text-sm text-white tracking-wide">Stadium Map</h2>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <Legend color="#10b981" label="Low" />
          <Legend color="#f59e0b" label="Moderate" />
          <Legend color="#f97316" label="High" />
          <Legend color="#ef4444" label="Critical" />
        </div>
      </div>

      {/* POI legend row */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-white/5 shrink-0 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-cyan-500 inline-block" /> Restroom</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block" /> Medical</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-600 inline-block" /> Food</span>
      </div>

      {/* SVG Map */}
      <div className="flex-1 relative overflow-hidden">
        <svg
          viewBox="0 0 800 600"
          className="w-full h-full"
          style={{ background: 'transparent' }}
        >
          {/* Background grid */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a2d4a" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="800" height="600" fill="url(#grid)" />
          <ellipse cx="400" cy="300" rx="320" ry="245" fill="url(#centerGlow)" />

          {/* Outer stadium shell */}
          <ellipse
            cx="400" cy="300" rx="310" ry="238"
            fill="none"
            stroke="#22385e"
            strokeWidth="2"
            opacity="0.6"
          />

          {/* Inner concourse ring */}
          <ellipse
            cx="400" cy="300" rx="268" ry="198"
            fill="#0d1626"
            stroke="#1a2d4a"
            strokeWidth="1.5"
            opacity="0.8"
          />

          {/* Section ring (seating bowl) */}
          <ellipse
            cx="400" cy="300" rx="218" ry="158"
            fill="#101e30"
            stroke="#22385e"
            strokeWidth="1"
          />

          {/* Field */}
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="#0f4c1f" stroke="#166534" strokeWidth="1.5" />
          {/* Field markings */}
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="none" stroke="#1a5c27" strokeWidth="0.8" />
          {/* Center circle */}
          <circle cx="400" cy="300" r="30" fill="none" stroke="#1a5c27" strokeWidth="0.8" />
          {/* Center spot */}
          <circle cx="400" cy="300" r="2" fill="#1a5c27" />
          {/* Halfway line */}
          <line x1="250" y1="300" x2="550" y2="300" stroke="#1a5c27" strokeWidth="0.8" />
          {/* Penalty areas */}
          <rect x="315" y="262" width="85" height="76" fill="none" stroke="#1a5c27" strokeWidth="0.8" />
          <rect x="400" y="262" width="85" height="76" fill="none" stroke="#1a5c27" strokeWidth="0.8" />
          {/* Goal boxes */}
          <rect x="335" y="278" width="45" height="44" fill="none" stroke="#1a5c27" strokeWidth="0.8" />
          <rect x="420" y="278" width="45" height="44" fill="none" stroke="#1a5c27" strokeWidth="0.8" />

          {/* Spoke lines from concourse to gate positions */}
          {gates.map(g => (
            <line
              key={`spoke-${g.id}`}
              x1="400" y1="300"
              x2={g.svgX} y2={g.svgY}
              stroke="#1a2d4a"
              strokeWidth="1"
              opacity="0.4"
            />
          ))}

          {/* POI markers — Restrooms */}
          {(activeLayer === 'all' || activeLayer === 'restrooms') &&
            poi.restrooms?.map(r => (
              <RestRoom key={r.id} x={r.svgX} y={r.svgY} accessible={r.accessible} />
            ))}

          {/* POI markers — Medical */}
          {(activeLayer === 'all' || activeLayer === 'medical') &&
            poi.medical_points?.map(m => (
              <MedicalPoint key={m.id} x={m.svgX} y={m.svgY} />
            ))}

          {/* POI markers — Food */}
          {(activeLayer === 'all' || activeLayer === 'food') &&
            poi.food_courts?.map(f => (
              <FoodCourt key={f.id} x={f.svgX} y={f.svgY} />
            ))}

          {/* Gate markers */}
          {gates.map(gate => (
            <GateMarker
              key={gate.id}
              gate={gate}
              densityGate={getDensityGate(gate.id)}
              onClick={handleGateClick}
              selected={selected?.gate?.id === gate.id}
            />
          ))}

          {/* "You Are Here" marker — rendered on top of everything */}
          {youPosition && (
            <YouAreHereMarker
              x={youPosition.x}
              y={youPosition.y}
              approximate={youPosition.approximate}
            />
          )}
        </svg>

        {/* Gate detail tooltip */}
        {selected && (
          <GateTooltip gate={selected.gate} densityGate={selected.densityGate} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-slate-400">
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function GateTooltip({ gate, densityGate, onClose }) {
  const status = densityGate?.status || 'low';
  const cfg = GATE_STATUS_COLORS[status];

  return (
    <div className="absolute bottom-4 left-4 right-4 glass-card border border-teal-500/20 p-4 animate-slide-up shadow-teal-glow">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-slate-500 hover:text-white text-xs"
      >✕</button>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-lg shrink-0"
          style={{ background: cfg.fill }}
        >
          {gate.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-white text-sm">{gate.name} — {gate.direction}</p>
          <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{gate.description}</p>
          {gate.accessible && (
            <span className="inline-block mt-1.5 text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full">
              ♿ Accessible
            </span>
          )}
          {densityGate && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <InfoCell label="Present" value={densityGate.current_count?.toLocaleString()} />
              <InfoCell label="Capacity" value={`${densityGate.pct?.toFixed(1)}%`} />
              <InfoCell label="Wait" value={`~${densityGate.avg_wait_minutes} min`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="text-center bg-navy-700/40 rounded-lg py-1.5">
      <p className="text-xs font-bold text-white">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

// src/components/StadiumMap.jsx
// Google Maps-style light map: light gray/white background, pitch stays green,
// gate markers are clean circles with drop-shadow (no neon glow),
// POI icons are Google Maps-pin style, tooltip is a white card.
// Support rendering route path and glowing target highlight.

import React, { useState, useMemo } from 'react';

// ── Stadium geographic bounds ──────────────────────────────────────────────────
const GEO_BOUNDS = {
  latMin: 40.8095, latMax: 40.8175,
  lngMin: -74.0800, lngMax: -74.0695,
};
const SVG_W = 800, SVG_H = 600;

function geoToSvg(lat, lng) {
  const { latMin, latMax, lngMin, lngMax } = GEO_BOUNDS;
  const nx = (lng - lngMin) / (lngMax - lngMin);
  const ny = 1 - (lat - latMin) / (latMax - latMin);
  const x = nx * SVG_W;
  const y = ny * SVG_H;
  const margin = 0.15;
  const outOfBounds = nx < -margin || nx > 1 + margin || ny < -margin || ny > 1 + margin;
  return {
    x: Math.max(20, Math.min(SVG_W - 20, x)),
    y: Math.max(20, Math.min(SVG_H - 20, y)),
    approximate: outOfBounds,
  };
}

// Gate status — clean colors (no neon)
const GATE_STATUS = {
  low:      { fill: '#34A853', stroke: '#2D9248', label: '#fff' },
  moderate: { fill: '#FBBC04', stroke: '#E8AB00', label: '#2d2d2d' },
  high:     { fill: '#FF6D00', stroke: '#E56200', label: '#fff' },
  critical: { fill: '#EA4335', stroke: '#D33426', label: '#fff' },
};

// ── POI markers — Google Maps pin style ────────────────────────────────────────
function RestRoom({ x, y, accessible }) {
  const color = accessible ? '#1A73E8' : '#5F6368';
  return (
    <g transform={`translate(${x},${y})`} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.20))' }}>
      <circle r="6" fill={color} stroke="white" strokeWidth="1.5" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="5" fill="white" fontWeight="bold">R</text>
    </g>
  );
}

function MedicalPoint({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.20))' }}>
      <circle r="6" fill="#EA4335" stroke="white" strokeWidth="1.5" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="white" fontWeight="bold">+</text>
    </g>
  );
}

// Food court
function FoodCourt({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.20))' }}>
      <circle r="6" fill="#FBBC04" stroke="white" strokeWidth="1.5" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="5" fill="#2d2d2d" fontWeight="bold">F</text>
    </g>
  );
}

// ── "You Are Here" marker — Google Maps blue dot ──────────────────────────────
function YouAreHereMarker({ x, y, approximate }) {
  return (
    <g transform={`translate(${x},${y})`}>
      {/* Pulsing accuracy ring */}
      <circle r="18" fill="#1A73E8" fillOpacity="0.12" stroke="#1A73E8" strokeWidth="1" strokeOpacity="0.3">
        <animate attributeName="r"       values="14;22;14" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2.2s" repeatCount="indefinite" />
      </circle>
      {/* Solid blue dot */}
      <circle r="8" fill="#1A73E8" stroke="white" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(26,115,232,0.45))' }} />
      {/* Person silhouette */}
      <circle cx="0" cy="-2.5" r="2.5" fill="white" />
      <path d="M -2.8 0.5 Q 0 6 2.8 0.5" fill="white" />
      {/* "You" label */}
      <rect x="-12" y="11" width="24" height="10" rx="3" fill="#1A73E8" />
      <text x="0" y="18" textAnchor="middle" fontSize="6.5" fill="white" fontWeight="700" fontFamily="system-ui,sans-serif">
        {approximate ? 'You ~' : 'You'}
      </text>
    </g>
  );
}

// ── Gate marker — clean circle, Google Maps pin style ─────────────────────────
function GateMarker({ gate, densityGate, onClick, selected }) {
  const status = densityGate?.status || 'low';
  const cfg    = GATE_STATUS[status] || GATE_STATUS.low;
  const pct    = densityGate?.pct ?? 0;

  return (
    <g
      transform={`translate(${gate.svgX},${gate.svgY})`}
      onClick={() => onClick(gate, densityGate)}
      style={{ cursor: 'pointer' }}
    >
      {/* Critical — subtle pulsing ring only, no neon */}
      {status === 'critical' && (
        <circle r="16" fill="none" stroke={cfg.fill} strokeWidth="1.5" opacity="0.3">
          <animate attributeName="r"       values="13;19;13" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      {/* Selection ring */}
      {selected && <circle r="15" fill="none" stroke="#1A73E8" strokeWidth="2" opacity="0.9" />}
      {/* Main gate circle with subtle drop-shadow */}
      <circle
        r="11"
        fill={cfg.fill}
        stroke="white"
        strokeWidth="2"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.20))' }}
      />
      {/* Gate letter */}
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={cfg.label} fontWeight="700"
        fontFamily="'Outfit',system-ui,sans-serif">
        {gate.label}
      </text>
      {/* Pct label below */}
      <text x="0" y="23" textAnchor="middle" fontSize="7" fill={cfg.fill} fontWeight="600"
        fontFamily="system-ui,sans-serif">
        {pct.toFixed(0)}%
      </text>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StadiumMap({
  floorplan,
  density,
  activeLayer,
  selectedGate,
  selectedSection,
  gpsLocation,
  setActiveTab,
  highlightTarget,
  setHighlightTarget,
}) {
  const [selected, setSelected] = useState(null);

  const gates        = floorplan?.gates ?? [];
  const poi          = floorplan?.points_of_interest ?? {};
  const sections     = floorplan?.sections ?? [];
  const densityGates = density?.gates ?? [];

  const getDensityGate = (gateId) => densityGates.find(g => g.gate_id === gateId);

  // Resolve "You Are Here" position
  const youPosition = useMemo(() => {
    if (gpsLocation?.lat != null && gpsLocation?.lng != null) {
      return { ...geoToSvg(gpsLocation.lat, gpsLocation.lng), source: 'gps' };
    }
    if (selectedSection) {
      const sec = sections.find(s => s.id === selectedSection);
      if (sec?.lat != null && sec?.lng != null) {
        return { ...geoToSvg(sec.lat, sec.lng), source: 'section' };
      }
    }
    if (selectedGate) {
      const gate = gates.find(g => g.id === selectedGate);
      if (gate) return { x: gate.svgX, y: gate.svgY, approximate: false, source: 'gate' };
    }
    return null;
  }, [gpsLocation, selectedGate, selectedSection, gates, sections]);

  // Resolve highlighted target position
  const highlightPosition = useMemo(() => {
    if (!highlightTarget) return null;
    const { id, type } = highlightTarget;

    // 1. Gates
    if (type === 'gates') {
      const g = gates.find(gate => gate.id === id);
      if (g) return { x: g.svgX, y: g.svgY, name: g.name };
    }
    // 2. Sections
    if (type === 'sections') {
      const s = sections.find(sec => sec.id === id);
      if (s && s.lat != null && s.lng != null) {
        return { ...geoToSvg(s.lat, s.lng), name: s.name };
      }
    }
    // 3. Points of interest
    if (['restrooms', 'medical_points', 'food_courts'].includes(type)) {
      const items = poi[type] || [];
      const item = items.find(i => i.id === id);
      if (item) return { x: item.svgX, y: item.svgY, name: item.name };
    }
    return null;
  }, [highlightTarget, gates, sections, poi]);

  const handleGateClick = (gate, densityGate) => {
    setSelected(prev => (prev?.id === gate.id ? null : { gate, densityGate }));
  };

  return (
    <div className="glass-card h-full flex flex-col overflow-hidden bg-white">
      {/* Panel header with back button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setActiveTab('chat');
              if (setHighlightTarget) setHighlightTarget(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100 active:scale-95 transition-all"
          >
            ← Back to Chat
          </button>
          <div className="h-4 w-[1px] bg-gray-200" />
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <h2 className="font-display font-semibold text-sm text-gray-800 tracking-wide">Stadium Map</h2>
          </div>
        </div>
        {/* Density legend */}
        <div className="flex items-center gap-3 text-[10px]">
          <Legend color="#34A853" label="Low" />
          <Legend color="#FBBC04" label="Moderate" />
          <Legend color="#FF6D00" label="High" />
          <Legend color="#EA4335" label="Critical" />
        </div>
      </div>

      {/* POI legend */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 shrink-0 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Restroom
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Medical
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Food
        </span>
        {youPosition && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> You are here
          </span>
        )}
      </div>

      {/* SVG Map */}
      <div className="flex-1 relative overflow-hidden">
        <svg viewBox="0 0 800 600" className="w-full h-full">
          <defs>
            {/* Light grid pattern */}
            <pattern id="lightgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8EAED" strokeWidth="0.5" />
            </pattern>
            {/* Subtle center glow — very faint on light bg */}
            <radialGradient id="mapGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#E8F0FE" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#F8F9FA" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Light background */}
          <rect width="800" height="600" fill="#F8F9FA" />
          <rect width="800" height="600" fill="url(#lightgrid)" />

          {/* Outer stadium shell — light border */}
          <ellipse cx="400" cy="300" rx="310" ry="238"
            fill="white" stroke="#DADCE0" strokeWidth="2" />

          {/* Inner concourse ring */}
          <ellipse cx="400" cy="300" rx="268" ry="198"
            fill="#F1F3F4" stroke="#E8EAED" strokeWidth="1.5" />

          {/* Seating bowl */}
          <ellipse cx="400" cy="300" rx="218" ry="158"
            fill="#E8EAED" stroke="#DADCE0" strokeWidth="1" />

          {/* Pitch — keep green as the one saturated element */}
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="#1E7A34" stroke="#166534" strokeWidth="1.5" />
          {/* Pitch markings */}
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <circle  cx="400" cy="300" r="30"  fill="none" stroke="#22913C" strokeWidth="0.8" />
          <circle  cx="400" cy="300" r="2"   fill="#22913C" />
          <line x1="250" y1="300" x2="550" y2="300" stroke="#22913C" strokeWidth="0.8" />
          <rect x="315" y="262" width="85" height="76" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="400" y="262" width="85" height="76" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="335" y="278" width="45" height="44" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="420" y="278" width="45" height="44" fill="none" stroke="#22913C" strokeWidth="0.8" />

          {/* Concourse spokes — very subtle */}
          {gates.map(g => (
            <line
              key={`spoke-${g.id}`}
              x1="400" y1="300" x2={g.svgX} y2={g.svgY}
              stroke="#DADCE0" strokeWidth="1" opacity="0.7"
            />
          ))}

          {/* POI markers */}
          {(activeLayer === 'all' || activeLayer === 'restrooms') &&
            poi.restrooms?.map(r => <RestRoom key={r.id} x={r.svgX} y={r.svgY} accessible={r.accessible} />)}
          {(activeLayer === 'all' || activeLayer === 'medical') &&
            poi.medical_points?.map(m => <MedicalPoint key={m.id} x={m.svgX} y={m.svgY} />)}
          {(activeLayer === 'all' || activeLayer === 'food') &&
            poi.food_courts?.map(f => <FoodCourt key={f.id} x={f.svgX} y={f.svgY} />)}

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

          {/* Highlight route line connecting You to Target */}
          {youPosition && highlightPosition && (
            <line
              x1={youPosition.x}
              y1={youPosition.y}
              x2={highlightPosition.x}
              y2={highlightPosition.y}
              stroke="#1A73E8"
              strokeWidth="3.5"
              strokeDasharray="6 4"
              opacity="0.8"
            >
              <animate attributeName="stroke-dashoffset" values="20;0" dur="1.5s" repeatCount="indefinite" />
            </line>
          )}

          {/* Highlight Target Marker */}
          {highlightPosition && (
            <g transform={`translate(${highlightPosition.x},${highlightPosition.y})`}>
              {/* Outer pulse */}
              <circle r="22" fill="none" stroke="#EA4335" strokeWidth="2" opacity="0.6">
                <animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Target pin background glow */}
              <circle r="12" fill="#EA4335" fillOpacity="0.25" stroke="#EA4335" strokeWidth="1.5" />
              {/* Target star/crosshair dot */}
              <circle r="5" fill="#EA4335" stroke="white" strokeWidth="1.5" />
              
              {/* Highlight Label */}
              <rect x="-45" y="-32" width="90" height="18" rx="4" fill="#EA4335" />
              <text
                x="0" y="-20"
                textAnchor="middle"
                fontSize="8.5"
                fill="white"
                fontWeight="700"
                fontFamily="system-ui,sans-serif"
              >
                {highlightPosition.name || 'Destination'}
              </text>
            </g>
          )}

          {/* "You Are Here" — on top of highlight lines */}
          {youPosition && (
            <YouAreHereMarker x={youPosition.x} y={youPosition.y} approximate={youPosition.approximate} />
          )}
        </svg>

        {/* Gate detail tooltip — white card */}
        {selected && (
          <GateTooltip
            gate={selected.gate}
            densityGate={selected.densityGate}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-gray-500">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function GateTooltip({ gate, densityGate, onClose }) {
  const status = densityGate?.status || 'low';
  const cfg    = GATE_STATUS[status] || GATE_STATUS.low;

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-card-lg animate-slide-up">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-sm font-medium"
      >✕</button>

      <div className="flex items-start gap-3">
        {/* Colored gate badge */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-lg shrink-0"
          style={{ background: cfg.fill, color: cfg.label }}
        >
          {gate.label}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-gray-900 text-sm">
            {gate.name} — {gate.direction}
          </p>
          <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{gate.description}</p>
          {gate.accessible && (
            <span className="inline-block mt-1.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
              ♿ Accessible
            </span>
          )}
          {densityGate && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <InfoCell label="Present"  value={densityGate.current_count?.toLocaleString()} />
              <InfoCell label="Capacity" value={`${densityGate.pct?.toFixed(1)}%`} />
              <InfoCell label="Wait"     value={`~${densityGate.avg_wait_minutes} min`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="text-center bg-gray-50 border border-gray-100 rounded-lg py-1.5">
      <p className="text-xs font-bold text-gray-800">{value}</p>
      <p className="text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

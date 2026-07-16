// src/components/StadiumMap.jsx
// Google Maps-style light map. Adds a real navigation layer:
//  - Concourse-ring routing (arcs around the seating bowl, not straight lines)
//  - Density-aware rerouting: avoids High/Critical gates
//  - Route summary banner with walk-time estimate
//  - Reroute advisory when the direct path is blocked

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
  return {
    x: Math.max(20, Math.min(SVG_W - 20, nx * SVG_W)),
    y: Math.max(20, Math.min(SVG_H - 20, ny * SVG_H)),
    approximate: nx < -0.15 || nx > 1.15 || ny < -0.15 || ny > 1.15,
  };
}

// ── Concourse ring geometry ────────────────────────────────────────────────────
// Midpoint of the concourse ellipse (between inner and outer rings)
const CONCOURSE_CX = 400, CONCOURSE_CY = 300;
const CONCOURSE_RX = 290, CONCOURSE_RY = 218; // mid-concourse radii

// Gate order clockwise from top (matches floorplan compass directions)
const GATE_ORDER = ['GATE_A','GATE_B','GATE_C','GATE_D','GATE_E','GATE_F','GATE_G','GATE_H'];

// SVG angles (degrees, 0 = right, CCW) for each gate on the ellipse
const GATE_ANGLES = {
  GATE_A: 270,  // North  (top)
  GATE_B: 315,  // NE
  GATE_C: 0,    // East   (right)
  GATE_D: 45,   // SE
  GATE_E: 90,   // South  (bottom)
  GATE_F: 135,  // SW
  GATE_G: 180,  // West   (left)
  GATE_H: 225,  // NW
};

/** Point on concourse ellipse at angle deg (0=right, 90=bottom, 180=left, 270=top) */
function ellipsePoint(deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CONCOURSE_CX + CONCOURSE_RX * Math.cos(rad),
    y: CONCOURSE_CY + CONCOURSE_RY * Math.sin(rad),
  };
}

/** Interpolate N evenly-spaced points along the shorter/chosen arc */
function arcPoints(startDeg, endDeg, clockwise, steps = 12) {
  let from = ((startDeg % 360) + 360) % 360;
  let to   = ((endDeg   % 360) + 360) % 360;

  // Determine angular distance in chosen direction
  let diff;
  if (clockwise) {
    diff = ((to - from) + 360) % 360;
  } else {
    diff = -((( from - to) + 360) % 360);
  }

  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const deg = from + (diff * i) / steps;
    pts.push(ellipsePoint(deg));
  }
  return pts;
}

/** Find the angle of a gate by ID */
function gateAngle(gateId) {
  return GATE_ANGLES[gateId] ?? 270;
}

/**
 * Build a concourse-following route from origin to destination.
 * Returns { points, clockwise, blockedGateIds, rerouted, walkMinutes }
 */
function buildConcourseRoute(originPt, targetPt, densityGates) {
  // Snap origin to nearest gate angle on the concourse
  const originAngle = pointToEllipseAngle(originPt);
  const targetAngle = pointToEllipseAngle(targetPt);

  // Which gates lie along the CW arc? Which along CCW?
  const cwGates  = gatesOnArc(originAngle, targetAngle, true);
  const ccwGates = gatesOnArc(originAngle, targetAngle, false);

  // Check if any gate on each arc is high/critical
  const congested = (gateId) => {
    const dg = densityGates.find(g => g.gate_id === gateId);
    return dg && (dg.status === 'high' || dg.status === 'critical');
  };

  const cwBlocked  = cwGates.filter(congested);
  const ccwBlocked = ccwGates.filter(congested);

  let clockwise, blocked, rerouted = false;

  if (cwBlocked.length === 0) {
    // Direct CW path is clear
    clockwise = true;
    blocked   = [];
  } else if (ccwBlocked.length < cwBlocked.length) {
    // CCW has fewer blockages — reroute
    clockwise = false;
    blocked   = cwBlocked; // what we're avoiding
    rerouted  = true;
  } else {
    // Both blocked or CW preferred anyway
    clockwise = true;
    blocked   = cwBlocked;
    rerouted  = blocked.length > 0;
  }

  // Build arc points
  const arcPts = arcPoints(originAngle, targetAngle, clockwise, 18);

  // Prepend origin, append target
  const points = [originPt, ...arcPts, targetPt];

  // Walk distance: sum of Euclidean distances between consecutive arc points
  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    dist += Math.sqrt(dx*dx + dy*dy);
  }
  // Calibration: concourse ring ~1700 SVG units = ~10 min walk
  const walkMinutes = Math.max(1, Math.round(dist / 170));

  return { points, clockwise, blockedGateIds: blocked, rerouted, walkMinutes };
}

/** Convert an arbitrary SVG point to its nearest angle on the concourse ellipse */
function pointToEllipseAngle(pt) {
  const dx = pt.x - CONCOURSE_CX;
  const dy = pt.y - CONCOURSE_CY;
  // Normalize for ellipse aspect ratio
  const angle = Math.atan2(dy / CONCOURSE_RY, dx / CONCOURSE_RX) * 180 / Math.PI;
  return ((angle % 360) + 360) % 360;
}

/** Return gate IDs that lie along the arc from startDeg to endDeg */
function gatesOnArc(startDeg, endDeg, clockwise) {
  return GATE_ORDER.filter(id => {
    const a = gateAngle(id);
    return angleBetween(startDeg, endDeg, a, clockwise);
  });
}

function angleBetween(start, end, angle, clockwise) {
  const s = ((start % 360) + 360) % 360;
  const e = ((end   % 360) + 360) % 360;
  const a = ((angle % 360) + 360) % 360;
  if (clockwise) {
    const span = ((e - s) + 360) % 360;
    const dist = ((a - s) + 360) % 360;
    return dist > 0 && dist < span;
  } else {
    const span = ((s - e) + 360) % 360;
    const dist = ((s - a) + 360) % 360;
    return dist > 0 && dist < span;
  }
}

/** Convert array of {x,y} points to SVG polyline points string */
function pointsToStr(pts) {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

// ── Gate status colours ───────────────────────────────────────────────────────
const GATE_STATUS = {
  low:      { fill: '#34A853', stroke: '#2D9248', label: '#fff' },
  moderate: { fill: '#FBBC04', stroke: '#E8AB00', label: '#2d2d2d' },
  high:     { fill: '#FF6D00', stroke: '#E56200', label: '#fff' },
  critical: { fill: '#EA4335', stroke: '#D33426', label: '#fff' },
};

// ── POI markers ───────────────────────────────────────────────────────────────
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
function FoodCourt({ x, y }) {
  return (
    <g transform={`translate(${x},${y})`} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.20))' }}>
      <circle r="6" fill="#FBBC04" stroke="white" strokeWidth="1.5" />
      <text x="0" y="1.5" textAnchor="middle" dominantBaseline="middle" fontSize="5" fill="#2d2d2d" fontWeight="bold">F</text>
    </g>
  );
}

// ── You Are Here ──────────────────────────────────────────────────────────────
function YouAreHereMarker({ x, y, approximate }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <circle r="18" fill="#1A73E8" fillOpacity="0.12" stroke="#1A73E8" strokeWidth="1" strokeOpacity="0.3">
        <animate attributeName="r"       values="14;22;14" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle r="8" fill="#1A73E8" stroke="white" strokeWidth="2.5"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(26,115,232,0.45))' }} />
      <circle cx="0" cy="-2.5" r="2.5" fill="white" />
      <path d="M -2.8 0.5 Q 0 6 2.8 0.5" fill="white" />
      <rect x="-12" y="11" width="24" height="10" rx="3" fill="#1A73E8" />
      <text x="0" y="18" textAnchor="middle" fontSize="6.5" fill="white" fontWeight="700" fontFamily="system-ui,sans-serif">
        {approximate ? 'You ~' : 'You'}
      </text>
    </g>
  );
}

// ── Gate marker ───────────────────────────────────────────────────────────────
function GateMarker({ gate, densityGate, onClick, selected }) {
  const status = densityGate?.status || 'low';
  const cfg    = GATE_STATUS[status] || GATE_STATUS.low;
  const pct    = densityGate?.pct ?? 0;
  return (
    <g transform={`translate(${gate.svgX},${gate.svgY})`} onClick={() => onClick(gate, densityGate)} style={{ cursor: 'pointer' }}>
      {status === 'critical' && (
        <circle r="16" fill="none" stroke={cfg.fill} strokeWidth="1.5" opacity="0.3">
          <animate attributeName="r"       values="13;19;13" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
      {selected && <circle r="15" fill="none" stroke="#1A73E8" strokeWidth="2" opacity="0.9" />}
      <circle r="11" fill={cfg.fill} stroke="white" strokeWidth="2"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.20))' }} />
      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={cfg.label} fontWeight="700"
        fontFamily="'Outfit',system-ui,sans-serif">{gate.label}</text>
      <text x="0" y="23" textAnchor="middle" fontSize="7" fill={cfg.fill} fontWeight="600"
        fontFamily="system-ui,sans-serif">{pct.toFixed(0)}%</text>
    </g>
  );
}

// ── Route summary banner ──────────────────────────────────────────────────────
function RouteSummary({ route, targetName, onDismiss }) {
  if (!route) return null;
  const { walkMinutes, rerouted, blockedGateIds } = route;
  const avoidedNames = blockedGateIds.map(id => id.replace('GATE_', 'Gate ')).join(', ');

  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 20,
      background: 'white',
      border: '1.5px solid #E8EAED',
      borderRadius: 14,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      padding: '8px 14px 8px 12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      maxWidth: 'calc(100% - 32px)',
      minWidth: 220,
      animation: 'fadeInUp 0.25s ease-out',
    }}>
      {/* Walking icon */}
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>🚶</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Main line */}
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#202124', lineHeight: 1.3 }}>
          {walkMinutes} min walk
          <span style={{ fontWeight: 500, color: '#5F6368' }}> to </span>
          <span style={{ color: '#1A73E8' }}>{targetName}</span>
        </div>

        {/* Reroute advisory */}
        {rerouted && avoidedNames && (
          <div style={{
            marginTop: 4,
            display: 'flex', alignItems: 'flex-start', gap: 5,
            padding: '4px 8px',
            background: '#FFF3E0',
            border: '1px solid #FFE0B2',
            borderRadius: 8,
            fontSize: 10.5,
            color: '#E65100',
            fontWeight: 600,
            lineHeight: 1.4,
          }}>
            <span style={{ flexShrink: 0 }}>⚠</span>
            <span>Rerouted to avoid crowding near {avoidedNames}</span>
          </div>
        )}
      </div>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9AA0A6', fontSize: 13, fontWeight: 700,
          padding: '0 0 0 4px', lineHeight: 1,
        }}
        aria-label="Dismiss route"
      >✕</button>
    </div>
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
  const [selected,      setSelected]      = useState(null);
  const [routeDismissed, setRouteDismissed] = useState(false);

  // Reset dismiss state when a new target arrives
  const prevTarget = React.useRef(null);
  if (highlightTarget !== prevTarget.current) {
    prevTarget.current = highlightTarget;
    // Don't call setState during render — use effect-free reset via key trick below
  }

  const gates        = floorplan?.gates ?? [];
  const poi          = floorplan?.points_of_interest ?? {};
  const sections     = floorplan?.sections ?? [];
  const densityGates = density?.gates ?? [];

  const getDensityGate = (gateId) => densityGates.find(g => g.gate_id === gateId);

  // ── Resolve highlight target position ────────────────────────────────────
  const highlightPosition = useMemo(() => {
    if (!highlightTarget) return null;
    const { id, type } = highlightTarget;
    if (type === 'gates') {
      const g = gates.find(gate => gate.id === id);
      if (g) return { x: g.svgX, y: g.svgY, name: g.name };
    }
    if (type === 'sections') {
      const s = sections.find(sec => sec.id === id);
      if (s?.lat != null) return { ...geoToSvg(s.lat, s.lng), name: s.name };
    }
    if (['restrooms', 'medical_points', 'food_courts'].includes(type)) {
      const item = (poi[type] || []).find(i => i.id === id);
      if (item) return { x: item.svgX, y: item.svgY, name: item.name };
    }
    return null;
  }, [highlightTarget, gates, sections, poi]);

  // ── Resolve "You Are Here" ────────────────────────────────────────────────
  const youPosition = useMemo(() => {
    if (gpsLocation?.lat != null && gpsLocation?.lng != null)
      return { ...geoToSvg(gpsLocation.lat, gpsLocation.lng), source: 'gps' };
    if (selectedSection) {
      const sec = sections.find(s => s.id === selectedSection);
      if (sec?.lat != null) return { ...geoToSvg(sec.lat, sec.lng), source: 'section' };
    }
    if (selectedGate) {
      const gate = gates.find(g => g.id === selectedGate);
      if (gate) return { x: gate.svgX, y: gate.svgY, approximate: false, source: 'gate' };
    }
    // Fallback: Default to Gate A if showing a route and no location is set yet
    if (highlightPosition && gates.length > 0) {
      const gateA = gates.find(g => g.id === 'GATE_A') || gates[0];
      return { x: gateA.svgX, y: gateA.svgY, approximate: true, source: 'fallback' };
    }
    return null;
  }, [gpsLocation, selectedGate, selectedSection, gates, sections, highlightPosition]);

  // ── Build concourse route ─────────────────────────────────────────────────
  const route = useMemo(() => {
    if (!youPosition || !highlightPosition) return null;
    return buildConcourseRoute(youPosition, highlightPosition, densityGates);
  }, [youPosition, highlightPosition, densityGates]);

  // Reset route dismiss state when target changes
  React.useEffect(() => {
    setRouteDismissed(false);
  }, [highlightTarget]);

  const showRoute = route && !routeDismissed;

  const handleDismiss = () => {
    setRouteDismissed(true);
  };

  const handleGateClick = (gate, dg) => {
    setSelected(prev => (prev?.id === gate.id ? null : { gate, densityGate: dg }));
  };

  const routePoints = showRoute ? pointsToStr(route.points) : null;

  return (
    <div className="glass-card h-full flex flex-col overflow-hidden bg-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setActiveTab('chat'); if (setHighlightTarget) setHighlightTarget(null); }}
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
        <div className="flex items-center gap-3 text-[10px]">
          <Legend color="#34A853" label="Low" />
          <Legend color="#FBBC04" label="Moderate" />
          <Legend color="#FF6D00" label="High" />
          <Legend color="#EA4335" label="Critical" />
        </div>
      </div>

      {/* ── POI legend strip ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 shrink-0 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Restroom</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Medical</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Food</span>
        {youPosition && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> You are here
          </span>
        )}
      </div>

      {/* ── SVG Map ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Route summary banner — overlaid at top of map */}
        {showRoute && highlightPosition && (
          <RouteSummary
            route={route}
            targetName={highlightPosition.name || (highlightTarget?.id ?? 'Destination')}
            onDismiss={handleDismiss}
          />
        )}

        <svg viewBox="0 0 800 600" className="w-full h-full">
          <defs>
            <pattern id="lightgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8EAED" strokeWidth="0.5" />
            </pattern>
            {/* Gradient for route shadow */}
            <filter id="routeShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1A73E8" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Background */}
          <rect width="800" height="600" fill="#F8F9FA" />
          <rect width="800" height="600" fill="url(#lightgrid)" />

          {/* Stadium shells */}
          <ellipse cx="400" cy="300" rx="310" ry="238" fill="white" stroke="#DADCE0" strokeWidth="2" />
          <ellipse cx="400" cy="300" rx="268" ry="198" fill="#F1F3F4" stroke="#E8EAED" strokeWidth="1.5" />
          <ellipse cx="400" cy="300" rx="218" ry="158" fill="#E8EAED" stroke="#DADCE0" strokeWidth="1" />

          {/* Pitch */}
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="#1E7A34" stroke="#166534" strokeWidth="1.5" />
          <ellipse cx="400" cy="300" rx="150" ry="105" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <circle  cx="400" cy="300" r="30"  fill="none" stroke="#22913C" strokeWidth="0.8" />
          <circle  cx="400" cy="300" r="2"   fill="#22913C" />
          <line x1="250" y1="300" x2="550" y2="300" stroke="#22913C" strokeWidth="0.8" />
          <rect x="315" y="262" width="85" height="76" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="400" y="262" width="85" height="76" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="335" y="278" width="45" height="44" fill="none" stroke="#22913C" strokeWidth="0.8" />
          <rect x="420" y="278" width="45" height="44" fill="none" stroke="#22913C" strokeWidth="0.8" />

          {/* Concourse spokes */}
          {gates.map(g => (
            <line key={`spoke-${g.id}`} x1="400" y1="300" x2={g.svgX} y2={g.svgY}
              stroke="#DADCE0" strokeWidth="1" opacity="0.7" />
          ))}

          {/* ── Route path — rendered below markers ─────────────────────── */}
          {showRoute && routePoints && (
            <>
              {/* Shadow / halo */}
              <polyline
                points={routePoints}
                fill="none"
                stroke="#1A73E8"
                strokeWidth="7"
                strokeOpacity="0.12"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Main dashed route */}
              <polyline
                points={routePoints}
                fill="none"
                stroke="#1A73E8"
                strokeWidth="3"
                strokeDasharray="8 5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.9"
                filter="url(#routeShadow)"
              >
                <animate attributeName="stroke-dashoffset" values="26;0" dur="1.8s" repeatCount="indefinite" />
              </polyline>
            </>
          )}

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

          {/* ── Destination marker ──────────────────────────────────────── */}
          {highlightPosition && (
            <g transform={`translate(${highlightPosition.x},${highlightPosition.y})`}>
              <circle r="22" fill="none" stroke="#EA4335" strokeWidth="2" opacity="0.6">
                <animate attributeName="r"       values="16;28;16" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle r="12" fill="#EA4335" fillOpacity="0.18" stroke="#EA4335" strokeWidth="1.5" />
              <circle r="5"  fill="#EA4335" stroke="white" strokeWidth="1.5" />
              {/* Name pill */}
              {(() => {
                const name = highlightPosition.name || 'Destination';
                const w = Math.max(70, name.length * 5.6 + 16);
                return (
                  <>
                    <rect x={-w/2} y="-34" width={w} height="18" rx="5" fill="#EA4335" />
                    <text x="0" y="-22" textAnchor="middle" fontSize="8.5" fill="white"
                      fontWeight="700" fontFamily="system-ui,sans-serif">
                      {name}
                    </text>
                  </>
                );
              })()}
            </g>
          )}

          {/* You Are Here — always on top */}
          {youPosition && (
            <YouAreHereMarker x={youPosition.x} y={youPosition.y} approximate={youPosition.approximate} />
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

// ── Sub-components ────────────────────────────────────────────────────────────
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
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-sm font-medium">✕</button>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-lg shrink-0"
          style={{ background: cfg.fill, color: cfg.label }}>
          {gate.label}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-gray-900 text-sm">{gate.name} — {gate.direction}</p>
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

// src/components/StadiumMap.jsx
// Google Maps-style light map. Adds a real navigation layer:
//  - Concourse-ring routing (arcs around the seating bowl, not straight lines)
//  - Density-aware rerouting: avoids High/Critical gates
//  - Route summary banner with walk-time estimate
//  - Reroute advisory when the direct path is blocked
//  - Interactive POI pins with conversational Ask AI popups

import React, { useState, useMemo } from 'react';
import { fanChat } from '../hooks/useRealtime';

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
const CONCOURSE_CX = 400, CONCOURSE_CY = 300;
const CONCOURSE_RX = 290, CONCOURSE_RY = 218;

const GATE_ORDER = ['GATE_A','GATE_B','GATE_C','GATE_D','GATE_E','GATE_F','GATE_G','GATE_H'];

const GATE_ANGLES = {
  GATE_A: 270,  // North
  GATE_B: 315,  // NE
  GATE_C: 0,    // East
  GATE_D: 45,   // SE
  GATE_E: 90,   // South
  GATE_F: 135,  // SW
  GATE_G: 180,  // West
  GATE_H: 225,  // NW
};

function ellipsePoint(deg) {
  const rad = (deg * Math.PI) / 180;
  return {
    x: CONCOURSE_CX + CONCOURSE_RX * Math.cos(rad),
    y: CONCOURSE_CY + CONCOURSE_RY * Math.sin(rad),
  };
}

function arcPoints(startDeg, endDeg, clockwise, steps = 12) {
  let from = ((startDeg % 360) + 360) % 360;
  let to   = ((endDeg   % 360) + 360) % 360;
  let diff;
  if (clockwise) {
    diff = ((to - from) + 360) % 360;
  } else {
    diff = -(((from - to) + 360) % 360);
  }
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const deg = from + (diff * i) / steps;
    pts.push(ellipsePoint(deg));
  }
  return pts;
}

function gateAngle(gateId) {
  return GATE_ANGLES[gateId] ?? 270;
}

function buildConcourseRoute(originPt, targetPt, densityGates) {
  const originAngle = pointToEllipseAngle(originPt);
  const targetAngle = pointToEllipseAngle(targetPt);

  const cwGates  = gatesOnArc(originAngle, targetAngle, true);
  const ccwGates = gatesOnArc(originAngle, targetAngle, false);

  const congested = (gateId) => {
    const dg = densityGates.find(g => g.gate_id === gateId);
    return dg && (dg.status === 'high' || dg.status === 'critical');
  };

  const cwBlocked  = cwGates.filter(congested);
  const ccwBlocked = ccwGates.filter(congested);

  // Shorter path defaults
  const cwDist = ((targetAngle - originAngle) + 360) % 360;
  const ccwDist = ((originAngle - targetAngle) + 360) % 360;
  const directIsCw = cwDist <= ccwDist;

  let clockwise, blocked, rerouted = false;

  if (directIsCw) {
    if (cwBlocked.length === 0) {
      clockwise = true;
      blocked = [];
    } else if (ccwBlocked.length < cwBlocked.length) {
      clockwise = false;
      blocked = cwBlocked;
      rerouted = true;
    } else {
      clockwise = true;
      blocked = cwBlocked;
      rerouted = cwBlocked.length > 0;
    }
  } else {
    if (ccwBlocked.length === 0) {
      clockwise = false;
      blocked = [];
    } else if (cwBlocked.length < ccwBlocked.length) {
      clockwise = true;
      blocked = ccwBlocked;
      rerouted = true;
    } else {
      clockwise = false;
      blocked = ccwBlocked;
      rerouted = ccwBlocked.length > 0;
    }
  }

  const arcPts = arcPoints(originAngle, targetAngle, clockwise, 18);
  const points = [originPt, ...arcPts, targetPt];

  let dist = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    dist += Math.sqrt(dx*dx + dy*dy);
  }
  const walkMinutes = Math.max(1, Math.round(dist / 170));

  const avoidedGatesInfo = blocked.map(gateId => {
    const dg = densityGates.find(g => g.gate_id === gateId);
    return {
      gateId,
      name: gateId.replace('GATE_', 'Gate '),
      pct: dg ? dg.pct : 0,
      wait: dg ? dg.avg_wait_minutes : 0,
      status: dg ? dg.status : 'low'
    };
  });

  const chosenGates = clockwise ? cwGates : ccwGates;
  const chosenGatesInfo = chosenGates.map(gateId => {
    const dg = densityGates.find(g => g.gate_id === gateId);
    return {
      gateId,
      name: gateId.replace('GATE_', 'Gate '),
      pct: dg ? dg.pct : 0,
      wait: dg ? dg.avg_wait_minutes : 0,
      status: dg ? dg.status : 'low'
    };
  });

  return { 
    points, 
    clockwise, 
    blockedGateIds: blocked, 
    rerouted, 
    walkMinutes,
    avoidedGatesInfo,
    chosenGatesInfo
  };
}

function pointToEllipseAngle(pt) {
  const dx = pt.x - CONCOURSE_CX;
  const dy = pt.y - CONCOURSE_CY;
  const angle = Math.atan2(dy / CONCOURSE_RY, dx / CONCOURSE_RX) * 180 / Math.PI;
  return ((angle % 360) + 360) % 360;
}

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

// ── POI markers with hitboxes ──────────────────────────────────────────────────
function RestRoom({ x, y, accessible, onClick, selected }) {
  const color = accessible ? '#1A73E8' : '#5F6368';
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${accessible ? 'Accessible ' : ''}Restroom`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <g
        style={{
          transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: selected ? 'scale(1.18)' : 'scale(1)',
          transformOrigin: '0px 0px',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.22)'}
        onMouseOut={e => e.currentTarget.style.transform = selected ? 'scale(1.18)' : 'scale(1)'}
      >
        <circle r="20" fill="transparent" />
        {selected && <rect x="-16" y="-16" width="32" height="32" rx="8" fill="none" stroke="#1A73E8" strokeWidth="2.5" opacity="0.95" />}
        <rect x="-12" y="-12" width="24" height="24" rx="6" fill={color} stroke="white" strokeWidth="1.5"
          style={{ filter: 'drop-shadow(0 2px 4.5px rgba(0,0,0,0.22))' }} />
        <text x="0" y="0.5" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="white" fontWeight="900">R</text>
      </g>
    </g>
  );
}

function MedicalPoint({ x, y, onClick, selected }) {
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Medical Point"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <g
        style={{
          transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: selected ? 'scale(1.18)' : 'scale(1)',
          transformOrigin: '0px 0px',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.22)'}
        onMouseOut={e => e.currentTarget.style.transform = selected ? 'scale(1.18)' : 'scale(1)'}
      >
        <circle r="20" fill="transparent" />
        {selected && <rect x="-16" y="-16" width="32" height="32" rx="7" transform="rotate(45)" fill="none" stroke="#EA4335" strokeWidth="2.5" opacity="0.95" />}
        <rect x="-12" y="-12" width="24" height="24" rx="5" fill="#EA4335" stroke="white" strokeWidth="1.5" transform="rotate(45)"
          style={{ filter: 'drop-shadow(0 2px 4.5px rgba(0,0,0,0.22))' }} />
        <text x="0" y="0.5" textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="white" fontWeight="900">+</text>
      </g>
    </g>
  );
}

function FoodCourt({ x, y, onClick, selected }) {
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Food Court"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <g
        style={{
          transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: selected ? 'scale(1.18)' : 'scale(1)',
          transformOrigin: '0px 0px',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.22)'}
        onMouseOut={e => e.currentTarget.style.transform = selected ? 'scale(1.18)' : 'scale(1)'}
      >
        <circle r="20" fill="transparent" />
        {selected && <circle r="16.5" fill="none" stroke="#FBBC04" strokeWidth="2.5" opacity="0.95" />}
        <circle r="12" fill="#FBBC04" stroke="white" strokeWidth="1.5"
          style={{ filter: 'drop-shadow(0 2px 4.5px rgba(0,0,0,0.22))' }} />
        <text x="0" y="0.5" textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#202124" fontWeight="900">F</text>
      </g>
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
    <g
      transform={`translate(${gate.svgX},${gate.svgY})`}
      onClick={() => onClick(gate, densityGate)}
      role="button"
      tabIndex={0}
      aria-label={`Gate ${gate.name}, status is ${status}, occupancy is ${pct.toFixed(0)} percent`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(gate, densityGate); } }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      <g
        style={{
          transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: selected ? 'scale(1.18)' : 'scale(1)',
          transformOrigin: '0px 0px',
        }}
        onMouseOver={e => e.currentTarget.style.transform = 'scale(1.22)'}
        onMouseOut={e => e.currentTarget.style.transform = selected ? 'scale(1.18)' : 'scale(1)'}
      >
        {status === 'critical' && (
          <circle r="22" fill="none" stroke={cfg.fill} strokeWidth="2" opacity="0.3">
            <animate attributeName="r"       values="17;24;17" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="1.8s" repeatCount="indefinite" />
          </circle>
        )}
        {selected && <circle r="19" fill="none" stroke="#1A73E8" strokeWidth="2" opacity="0.9" />}
        <circle r="15" fill={cfg.fill} stroke="white" strokeWidth="2"
          style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.22))' }} />
        <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fill={cfg.label} fontWeight="800"
          fontFamily="'Outfit',system-ui,sans-serif">{gate.label}</text>
        
        {/* Occupancy pill - moved above the circle with a light background for contrast */}
        <rect x="-17" y="-28" width="34" height="11" rx="4" fill="#F8F9FA" stroke="#DADCE0" strokeWidth="1"
          style={{ filter: 'drop-shadow(0 1.5px 3px rgba(0,0,0,0.12))' }} />
        <text x="0" y="-20.5" textAnchor="middle" fontSize="8.5" fill="#202124" fontWeight="800"
          fontFamily="system-ui,sans-serif">{pct.toFixed(0)}%</text>
      </g>
    </g>
  );
}

// ── Route summary banner ──────────────────────────────────────────────────────
function RouteSummary({ route, targetName, onDismiss }) {
  if (!route) return null;
  const { walkMinutes, rerouted, blockedGateIds, avoidedGatesInfo = [], chosenGatesInfo = [] } = route;
  const avoidedNames = blockedGateIds.map(id => id.replace('GATE_', 'Gate ')).join(', ');
  const [expanded, setExpanded] = useState(false);

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
      flexDirection: 'column',
      gap: 6,
      maxWidth: 'calc(100% - 32px)',
      width: 290,
      animation: 'fadeInUp 0.25s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>🚶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#202124', lineHeight: 1.3 }}>
            {walkMinutes} min walk
            <span style={{ fontWeight: 500, color: '#5F6368' }}> to </span>
            <span style={{ color: '#1A73E8' }}>{targetName}</span>
          </div>
          {rerouted && avoidedNames && (
            <div
              onClick={() => setExpanded(!expanded)}
              style={{
                marginTop: 4,
                display: 'flex', alignItems: 'flex-start', gap: 5,
                padding: '4px 8px',
                background: '#FFF3E0',
                border: '1px solid #FFE0B2',
                borderRadius: 8,
                fontSize: 10,
                color: '#E65100',
                fontWeight: 600,
                lineHeight: 1.4,
                cursor: 'pointer',
                userSelect: 'none',
              }}
              title="Click to view live occupancy numbers behind the rerouting decision"
            >
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>
                Rerouted to avoid crowding near {avoidedNames}{' '}
                <span style={{ textDecoration: 'underline', fontStyle: 'italic', display: 'inline-block', marginLeft: 2 }}>
                  {expanded ? '(Hide detail ▴)' : '(Show details ▾)'}
                </span>
              </span>
            </div>
          )}
        </div>
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

      {expanded && rerouted && (
        <div style={{
          marginTop: 2,
          padding: '8px 10px',
          background: '#F8F9FA',
          border: '1px solid #E8EAED',
          borderRadius: 10,
          fontSize: 10.5,
          color: '#3C4043',
          lineHeight: 1.4,
          animation: 'fadeInUp 0.15s ease-out',
        }}>
          <div style={{ fontWeight: 700, color: '#202124', marginBottom: 6 }}>
            <span>Live Decision Data</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <p style={{ fontWeight: 700, color: '#D93025', margin: 0 }}>Original Path</p>
              {avoidedGatesInfo.map(g => (
                <div key={g.gateId} style={{ marginTop: 2 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{g.name}</p>
                  <p style={{ margin: 0, color: '#5F6368' }}>{g.pct.toFixed(0)}% load, ~{g.wait}m wait</p>
                </div>
              ))}
              {avoidedGatesInfo.length === 0 && <p style={{ margin: 0, color: '#5F6368' }}>Blocked</p>}
            </div>
            <div style={{ borderLeft: '1px solid #DADCE0', paddingLeft: 10 }}>
              <p style={{ fontWeight: 700, color: '#188038', margin: 0 }}>New Path</p>
              {chosenGatesInfo.slice(0, 2).map(g => (
                <div key={g.gateId} style={{ marginTop: 2 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{g.name}</p>
                  <p style={{ margin: 0, color: '#5F6368' }}>{g.pct.toFixed(0)}% load, ~{g.wait}m wait</p>
                </div>
              ))}
              {chosenGatesInfo.length === 0 && <p style={{ margin: 0, color: '#5F6368' }}>Clear</p>}
            </div>
          </div>
        </div>
      )}
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

  // Ask AI in Popup states
  const [aiLoading, setAiLoading] = useState(false);
  const [popupMessages, setPopupMessages] = useState([]);
  const [aiError,   setAiError]   = useState(null);

  // Zoom & Pan custom hooks
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [dragged, setDragged] = useState(false);

  // Reset pan offsets when zoom is returned to 1x
  React.useEffect(() => {
    if (zoom === 1) {
      setPanX(0);
      setPanY(0);
    }
  }, [zoom]);

  const handleWheel = (e) => {
    // Prevent default browser zoom scroll only if mouse is over map
    e.preventDefault();
    const zoomFactor = 1.08;
    const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    setZoom(Math.max(1, Math.min(5, nextZoom)));
  };

  const handleMouseDown = (e) => {
    setIsPanning(true);
    setDragged(false);
    setStartPan({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - (startPan.x + panX);
    const dy = e.clientY - (startPan.y + panY);
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setDragged(true);
    }
    setPanX(e.clientX - startPan.x);
    setPanY(e.clientY - startPan.y);
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
  };

  // Clear AI states when popup target changes
  React.useEffect(() => {
    setAiLoading(false);
    setPopupMessages([]);
    setAiError(null);
  }, [selected]);

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
    if (dragged) return;
    setSelected(prev => (prev?.item?.id === gate.id ? null : { type: 'gate', item: gate, densityGate: dg }));
  };

  const handlePoiClick = (item, type) => {
    if (dragged) return;
    setSelected(prev => (prev?.item?.id === item.id ? null : { type, item }));
  };

  const handleSendPopupMessage = async (text) => {
    if (!text.trim() || !selected?.item) return;

    const userMsg = { role: 'user', text: text.trim() };
    setPopupMessages(prev => [...prev, userMsg]);
    setAiLoading(true);
    setAiError(null);

    try {
      const chatHistory = popupMessages
        .map(m => ({ role: m.role, text: m.text }))
        .slice(-6);
      const res = await fanChat(
        text.trim(),
        'en',
        selectedGate,
        selectedSection,
        gpsLocation,
        5,
        chatHistory
      );
      const aiMsg = { role: 'ai', text: res.answer };
      setPopupMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      setAiError(err.message || 'Failed to get answer from AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handleInitialAsk = () => {
    if (!selected?.item) return;
    const itemName = selected.item.name || selected.item.id;
    handleSendPopupMessage(`Tell me about ${itemName} and its current operational status or wait time.`);
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
      <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 shrink-0 text-[10px] text-gray-500 bg-gray-50/50">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-[17px] h-[17px] rounded-[5px] flex-shrink-0 flex items-center justify-center bg-[#5F6368] text-white text-[8px] font-bold border border-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }}>R</span>
          Restroom
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-[13px] h-[13px] rotate-45 flex-shrink-0 flex items-center justify-center bg-[#EA4335] text-white border border-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }}>
            <span className="-rotate-45 text-[9px] font-black" style={{ display: 'inline-block', transform: 'translateY(-0.5px)' }}>+</span>
          </span>
          Medical
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-[17px] h-[17px] rounded-full flex-shrink-0 flex items-center justify-center bg-[#FBBC04] text-[#202124] text-[8px] font-black border border-white" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.18)' }}>F</span>
          Food
        </span>
        {youPosition && (
          <span className="flex items-center gap-1.5 ml-auto font-medium">
            <span className="w-4 h-4 rounded-full flex items-center justify-center bg-[#1A73E8] text-white text-[6.5px] font-bold border border-white" style={{ boxShadow: '0 1px 2.5px rgba(26,115,232,0.3)' }}>Y</span>
            You are here
          </span>
        )}
      </div>

      {/* ── SVG Map ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* Route summary banner */}
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
            <filter id="routeShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1A73E8" floodOpacity="0.25" />
            </filter>
          </defs>

          {/*defs*/}
          <defs>
            <pattern id="lightgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8EAED" strokeWidth="0.5" />
            </pattern>
            <filter id="routeShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#1A73E8" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Background - kept fixed */}
          <rect width="800" height="600" fill="#F8F9FA" />
          <rect width="800" height="600" fill="url(#lightgrid)" />

          {/* Transform group for Zoom and Pan */}
          <g
            transform={`translate(${panX}, ${panY}) scale(${zoom})`}
            style={{
              transformOrigin: '400px 300px',
              transition: isPanning ? 'none' : 'transform 0.15s ease-out',
            }}
          >
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
            {React.useMemo(() => {
              return gates.map(g => (
                <line key={`spoke-${g.id}`} x1="400" y1="300" x2={g.svgX} y2={g.svgY}
                  stroke="#DADCE0" strokeWidth="1" opacity="0.7" />
              ));
            }, [gates])}

            {/* Route path */}
            {showRoute && routePoints && (
              <>
                <polyline
                  points={routePoints}
                  fill="none"
                  stroke="#1A73E8"
                  strokeWidth="7"
                  strokeOpacity="0.12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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
            {React.useMemo(() => {
              // Flatten active POIs first
              const activePois = [];
              if (activeLayer === 'all' || activeLayer === 'restrooms') {
                poi.restrooms?.forEach(r => activePois.push({ ...r, type: 'restroom' }));
              }
              if (activeLayer === 'all' || activeLayer === 'medical') {
                poi.medical_points?.forEach(m => activePois.push({ ...m, type: 'medical_point' }));
              }
              if (activeLayer === 'all' || activeLayer === 'food') {
                poi.food_courts?.forEach(f => activePois.push({ ...f, type: 'food_court' }));
              }

              // Resolve nearby gates and offset amenities to prevent overlaps
              const adjustedPois = [];
              activePois.forEach(p => {
                let newX = p.svgX;
                let newY = p.svgY;

                let closestGate = null;
                let minDist = 9999;
                gates.forEach(gate => {
                  const dx = p.svgX - gate.svgX;
                  const dy = p.svgY - gate.svgY;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist < minDist) {
                    minDist = dist;
                    closestGate = gate;
                  }
                });

                if (closestGate && minDist < 38) {
                  const dx = p.svgX - closestGate.svgX;
                  const dy = p.svgY - closestGate.svgY;
                  const len = Math.sqrt(dx * dx + dy * dy) || 1;
                  // Push POI to exactly 38px away from the gate center to guarantee clear separation
                  newX = closestGate.svgX + (dx / len) * 38;
                  newY = closestGate.svgY + (dy / len) * 38;
                }
                adjustedPois.push({ ...p, svgX: newX, svgY: newY });
              });

              // Cluster de-confliction: group markers within 26px proximity
              const groups = [];
              adjustedPois.forEach(p => {
                let added = false;
                for (const g of groups) {
                  const dx = p.svgX - g.center.x;
                  const dy = p.svgY - g.center.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist < 26) {
                    g.items.push(p);
                    added = true;
                    break;
                  }
                }
                if (!added) {
                  groups.push({ center: { x: p.svgX, y: p.svgY }, items: [p] });
                }
              });

              // Position and render
              const list = [];
              groups.forEach(g => {
                const N = g.items.length;
                g.items.forEach((p, index) => {
                  let x = p.svgX;
                  let y = p.svgY;
                  if (N > 1) {
                    // Offset radially around the group center
                    const radius = 22; // spaced out further to accommodate larger icons
                    const angle = (index * 2 * Math.PI) / N;
                    x = g.center.x + radius * Math.cos(angle);
                    y = g.center.y + radius * Math.sin(angle);
                  }

                  if (p.type === 'restroom') {
                    list.push(
                      <RestRoom
                        key={p.id}
                        x={x}
                        y={y}
                        accessible={p.accessible}
                        onClick={() => handlePoiClick(p, 'restroom')}
                        selected={selected?.type === 'restroom' && selected?.item?.id === p.id}
                      />
                    );
                  } else if (p.type === 'medical_point') {
                    list.push(
                      <MedicalPoint
                        key={p.id}
                        x={x}
                        y={y}
                        onClick={() => handlePoiClick(p, 'medical_point')}
                        selected={selected?.type === 'medical_point' && selected?.item?.id === p.id}
                      />
                    );
                  } else if (p.type === 'food_court') {
                    list.push(
                      <FoodCourt
                        key={p.id}
                        x={x}
                        y={y}
                        onClick={() => handlePoiClick(p, 'food_court')}
                        selected={selected?.type === 'food_court' && selected?.item?.id === p.id}
                      />
                    );
                  }
                });
              });

              return list;
            }, [activeLayer, poi, selected, gates])}

            {/* Gate markers */}
            {React.useMemo(() => {
              return gates.map(gate => (
                <GateMarker
                  key={gate.id}
                  gate={gate}
                  densityGate={getDensityGate(gate.id)}
                  onClick={handleGateClick}
                  selected={selected?.type === 'gate' && selected?.item?.id === gate.id}
                />
              ));
            }, [gates, densityGates, selected])}

            {/* Destination marker - Upgraded Google Maps Pin style */}
            {highlightPosition && (
              <g transform={`translate(${highlightPosition.x},${highlightPosition.y})`}>
                {/* Outer pulsing halos */}
                <circle r="36" fill="none" stroke="#EA4335" strokeWidth="3" opacity="0.8">
                  <animate attributeName="r"       values="15;38;15" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
                </circle>
                <circle r="24" fill="none" stroke="#FBBC04" strokeWidth="2" opacity="0.7">
                  <animate attributeName="r"       values="10;26;10" dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0;0.7" dur="1.5s" repeatCount="indefinite" />
                </circle>
                {/* Glowing backdrop */}
                <circle r="16" fill="#EA4335" fillOpacity="0.25" stroke="#EA4335" strokeWidth="2" />
                {/* Google Maps Pin Path */}
                <path d="M 0,0 C -5,-8 -8,-12 -8,-18 C -8,-24 -4,-28 0,-28 C 4,-28 8,-24 8,-18 C 8,-12 5,-8 0,0 Z" fill="#EA4335" stroke="white" strokeWidth="2" style={{ filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }} />
                <circle cx="0" cy="-18" r="3.5" fill="white" />
                {(() => {
                  const name = highlightPosition.name || 'Destination';
                  const w = Math.max(85, name.length * 6 + 18);
                  return (
                    <g transform="translate(0, -38)">
                      {/* Shadow rect */}
                      <rect x={-w/2 + 2} y="-16" width={w} height="20" rx="6" fill="#000" opacity="0.15" />
                      {/* Main badge */}
                      <rect x={-w/2} y="-18" width={w} height="20" rx="6" fill="#EA4335" stroke="white" strokeWidth="1.5" />
                      <text x="0" y="-8" textAnchor="middle" fontSize="9.5" fill="white"
                        fontWeight="800" fontFamily="system-ui,sans-serif">
                        📍 {name.toUpperCase()}
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* You Are Here */}
            {youPosition && (
              <YouAreHereMarker x={youPosition.x} y={youPosition.y} approximate={youPosition.approximate} />
            )}
          </g>
        </svg>

        {/* Floating zoom controls */}
        <div style={{ position: 'absolute', bottom: 12, right: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10 }}>
          <button
            onClick={() => setZoom(z => Math.min(5, z * 1.2))}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center font-bold text-gray-700 hover:bg-gray-50 active:scale-90 transition-all text-base select-none"
            title="Zoom In"
            style={{ cursor: 'pointer' }}
          >+</button>
          <button
            onClick={() => setZoom(z => Math.max(1, z / 1.2))}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center font-bold text-gray-700 hover:bg-gray-50 active:scale-90 transition-all text-base select-none"
            style={{ cursor: 'pointer' }}
            title="Zoom Out"
          >–</button>
          <button
            onClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
            className="px-2 py-1 rounded bg-white border border-gray-200 shadow-sm flex items-center justify-center font-semibold text-[9px] text-gray-500 hover:bg-gray-50 active:scale-90 transition-all select-none"
            style={{ cursor: 'pointer' }}
            title="Reset Zoom"
          >RESET</button>
        </div>

        {/* Zoom help tooltip */}
        <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(2px)', border: '1px solid #E8EAED', borderRadius: 8, padding: '4px 8px', fontSize: 10, color: '#5F6368', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
          <span>🔍</span>
          <span>Scroll to Zoom · Drag to Pan</span>
        </div>

        {/* Interactive map details popup */}
        {selected && (
          <InteractiveMapPopup
            selected={selected}
            onClose={() => setSelected(null)}
            aiLoading={aiLoading}
            popupMessages={popupMessages}
            aiError={aiError}
            onInitialAsk={handleInitialAsk}
            onSendMessage={handleSendPopupMessage}
          />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5 text-gray-600 font-semibold">
      <span
        className="w-3.5 h-3.5 rounded-full inline-block border-2 border-white"
        style={{
          background: color,
          boxShadow: '0 1.5px 3.5px rgba(0,0,0,0.22)',
        }}
      />
      {label}
    </span>
  );
}

function InteractiveMapPopup({
  selected,
  onClose,
  aiLoading,
  popupMessages,
  aiError,
  onInitialAsk,
  onSendMessage
}) {
  if (!selected) return null;
  const { type, item, densityGate } = selected;

  const status = densityGate?.status || 'low';
  const cfg = GATE_STATUS[status] || GATE_STATUS.low;

  const [inputVal, setInputVal] = useState('');
  const chatBottomRef = React.useRef(null);

  React.useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [popupMessages, aiLoading]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputVal.trim() || aiLoading) return;
    onSendMessage(inputVal.trim());
    setInputVal('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
    }
  };

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white border border-gray-200 rounded-2xl p-4 shadow-card-lg animate-slide-up flex flex-col max-h-[385px] overflow-hidden" style={{ zIndex: 30 }}>
      <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-sm font-medium" style={{ zIndex: 40 }}>✕</button>

      {/* Top Section: Static Details Info */}
      <div className="flex items-start gap-3 border-b border-gray-100 pb-3 shrink-0">
        {type === 'gate' && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold text-lg shrink-0"
            style={{ background: cfg.fill, color: cfg.label }}>
            {item.label}
          </div>
        )}
        {type === 'restroom' && (
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center text-lg shrink-0">
            🚻
          </div>
        )}
        {type === 'medical_point' && (
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center text-lg shrink-0">
            🏥
          </div>
        )}
        {type === 'food_court' && (
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center text-lg shrink-0">
            🍔
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-gray-900 text-sm leading-tight">
            {item.name} {type === 'gate' ? `— ${item.direction}` : ''}
          </p>
          {type === 'gate' && <p className="text-gray-500 text-[11px] mt-0.5 leading-relaxed">{item.description}</p>}
          {type === 'restroom' && (
            <p className="text-gray-500 text-[11px] mt-0.5">
              Location: {item.floor} (near {item.section_ref?.replace('SEC_', 'Section ')})
            </p>
          )}
          {type === 'medical_point' && (
            <p className="text-gray-500 text-[11px] mt-0.5">
              Location: Concourse (near {item.section_ref?.replace('SEC_', 'Section ')}) · Staff: {item.staff}
            </p>
          )}
          {type === 'food_court' && (
            <p className="text-gray-500 text-[11px] mt-0.5">
              Location: Concourse (near {item.section_ref?.replace('SEC_', 'Section ')})
            </p>
          )}

          <div className="flex flex-wrap gap-1 mt-1.5">
            {item.accessible && (
              <span className="text-[8px] bg-blue-50 text-blue-700 border border-blue-150 px-1.5 py-0.5 rounded font-semibold">
                ♿ Accessible
              </span>
            )}
            {type === 'medical_point' && item.equipment?.map(eq => (
              <span key={eq} className="text-[8px] bg-red-50 text-red-700 border border-red-150 px-1.5 py-0.5 rounded font-semibold">
                🛡️ {eq}
              </span>
            ))}
            {type === 'food_court' && item.vendors?.map(v => (
              <span key={v} className="text-[8px] bg-amber-50 text-amber-800 border border-amber-150 px-1.5 py-0.5 rounded font-semibold">
                🍿 {v}
              </span>
            ))}
            {type === 'food_court' && item.dietary?.map(d => (
              <span key={d} className="text-[8px] bg-green-50 text-green-800 border border-green-200 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                🌱 {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Middle Section: Chat history area */}
      <div className="flex-1 overflow-y-auto custom-scroll py-3 flex flex-col gap-2 min-h-0">
        {type === 'gate' && densityGate && popupMessages.length === 0 && (
          <div className="grid grid-cols-3 gap-2 py-1">
            <InfoCell label="Present"  value={densityGate.current_count?.toLocaleString()} />
            <InfoCell label="Capacity" value={`${densityGate.pct?.toFixed(1)}%`} />
            <InfoCell label="Wait"     value={`~${densityGate.avg_wait_minutes} min`} />
          </div>
        )}

        {popupMessages.length === 0 && !aiLoading && !aiError && (
          <div className="flex flex-col items-center justify-center py-4 px-2">
            <p className="text-[11px] text-gray-400 text-center mb-2.5">Have questions about wait times, access routes or details?</p>
            <button
              onClick={onInitialAsk}
              className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-[11px] font-bold text-blue-700 transition-all active:scale-[0.98] cursor-pointer"
            >
              ✨ Ask AI about this pin
            </button>
          </div>
        )}

        {popupMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
            style={{ animation: 'fadeInUp 0.2s ease-out' }}
          >
            <div
              className={`p-2.5 rounded-2xl text-[11.5px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-150'
              }`}
            >
              {msg.role === 'ai' && (
                <div className="text-[9px] font-bold text-blue-700 tracking-wider uppercase mb-1 flex items-center gap-1">
                  <span>✨</span> AI Assistant
                </div>
              )}
              <p className="whitespace-pre-line">{msg.text}</p>
            </div>
          </div>
        ))}

        {aiLoading && (
          <div className="self-start flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-2.5 max-w-[80%]">
            <span className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-[10px] text-gray-500 font-semibold animate-pulse">AI is typing…</span>
          </div>
        )}

        {aiError && (
          <div className="text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5 self-stretch">
            <span className="font-bold">⚠ Error:</span> {aiError}
            <button onClick={onInitialAsk} className="ml-2 font-bold text-red-700 underline cursor-pointer">Retry</button>
          </div>
        )}

        <div ref={chatBottomRef} className="h-0 shrink-0" />
      </div>

      {/* Bottom Section: Chat Input Field */}
      {(popupMessages.length > 0 || aiLoading) && (
        <form onSubmit={handleSend} className="border-t border-gray-100 pt-2 shrink-0 flex items-center gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask a question about ${item.name || 'this pin'}...`}
            disabled={aiLoading}
            className="flex-1 bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-800 outline-none focus:border-blue-300 focus:bg-white transition-all"
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || aiLoading}
            className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all ${
              !inputVal.trim() || aiLoading
                ? 'bg-gray-200 text-gray-400'
                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer active:scale-95'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </form>
      )}
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

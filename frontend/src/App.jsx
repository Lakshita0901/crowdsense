// src/App.jsx
// Light Google Maps-style layout. No dark backgrounds anywhere.
// Entry flow:  'landing' → 'onboarding' → 'app'
import React, { useState } from 'react';
import Header         from './components/Header';
import StadiumMap     from './components/StadiumMap';
import DensityPanel   from './components/DensityPanel';
import FanChatPanel   from './components/FanChatPanel';
import LandingScreen  from './components/LandingScreen';
import OnboardingScreen from './components/OnboardingScreen';
import MatchBar       from './components/MatchBar';
import { useRealtime } from './hooks/useRealtime';

const LAYERS = ['all', 'restrooms', 'medical', 'food'];
const LAYER_LABELS = { all: '🗺 All', restrooms: '🚻 Restrooms', medical: '🏥 Medical', food: '🍔 Food' };

export default function App() {
  const { density, floorplan, loading, error, tickCount } = useRealtime(5000);
  const [activeLayer, setActiveLayer] = useState('all');
  const [activeTab,   setActiveTab]   = useState('chat'); // 'chat' | 'map' | 'density'
  const [highlightTarget, setHighlightTarget] = useState(null); // { id, name, type }

  // ── Entry-flow state machine ──────────────────────────────────────────────
  // 'landing' → 'onboarding' → 'app'
  const [view, setView] = useState('landing');

  // ── Fan location state (shared across all screens) ────────────────────────
  const [selectedGate,    setSelectedGate]    = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [gpsLocation,     setGpsLocation]     = useState(null);

  return (
    <>
      {/* ── Screen 1: Landing ────────────────────────────────────────────── */}
      {view === 'landing' && (
        <LandingScreen onEnter={() => setView('onboarding')} />
      )}

      {/* ── Screen 2: Onboarding ─────────────────────────────────────────── */}
      {view === 'onboarding' && (
        <OnboardingScreen
          floorplan={floorplan}
          selectedGate={selectedGate}       setSelectedGate={setSelectedGate}
          selectedSection={selectedSection} setSelectedSection={setSelectedSection}
          gpsLocation={gpsLocation}         setGpsLocation={setGpsLocation}
          onComplete={() => setView('app')}
        />
      )}

      {/* ── Screen 3: Main dashboard ─────────────────────────────────────── */}
      {/* Rendered even during onboarding (behind it) so data loads in bg   */}
      <div
        className="h-screen flex flex-col bg-[#F8F9FA] overflow-hidden"
        style={{
          // Hidden while onboarding; visible once view === 'app'
          visibility: view === 'app' ? 'visible' : 'hidden',
          pointerEvents: view === 'app' ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <Header density={density} tickCount={tickCount} />

        {/* Persistent live match strip */}
        <MatchBar />

        {/* Error banner — light red */}
        {error && (
          <div className="shrink-0 bg-red-50 border-b border-red-200 text-red-700 text-xs px-5 py-2 flex items-center gap-2">
            <span>⚠</span>
            {error} — Is the backend running? (<code className="font-mono bg-red-100 px-1 rounded">uvicorn main:app --reload --port 8000</code>)
          </div>
        )}

        {/* Navigation & Toolbar */}
        <div className="shrink-0 flex items-center gap-4 px-4 py-2 bg-white border-b border-gray-200 flex-wrap">
          {/* Unified segmented navigation for both desktop and mobile */}
          <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-xl border border-gray-200">
            {[
              ['chat', '💬 Assistant'],
              ['map', '🗺️ Stadium Map'],
              ['density', '📊 Gate Status']
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if (tab !== 'map') setHighlightTarget(null);
                }}
                className={`text-xs px-3.5 py-1.5 rounded-lg font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-white text-gmaps-blue shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Map Layer toggles (Only visible when Map view is active) */}
          {activeTab === 'map' && (
            <div className="flex items-center gap-2 animate-fade-in">
              <div className="h-4 w-[1px] bg-gray-200 mx-2" />
              <span className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">Layers:</span>
              <div className="flex items-center gap-1.5">
                {LAYERS.map(layer => (
                  <button
                    key={layer}
                    onClick={() => setActiveLayer(layer)}
                    className={`text-[11px] px-3 py-1 rounded-full border font-medium transition-all ${
                      activeLayer === layer
                        ? 'bg-gmaps-blue text-white border-gmaps-blue shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {LAYER_LABELS[layer]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content pane */}
        <main className="flex-1 overflow-hidden p-3 flex flex-col justify-center items-center">
          <div className="w-full h-full max-w-5xl flex flex-col min-h-0">
            {activeTab === 'chat' && (
              <div className="w-full h-full max-w-2xl mx-auto flex flex-col min-h-0">
                <FanChatPanel
                  floorplan={floorplan}
                  selectedGate={selectedGate}
                  setSelectedGate={setSelectedGate}
                  selectedSection={selectedSection}
                  setSelectedSection={setSelectedSection}
                  gpsLocation={gpsLocation}
                  setGpsLocation={setGpsLocation}
                  setActiveTab={setActiveTab}
                  setHighlightTarget={setHighlightTarget}
                  setActiveLayer={setActiveLayer}
                />
              </div>
            )}
            {activeTab === 'map' && (
              <div className="w-full h-full flex flex-col min-h-0">
                <StadiumMap
                  floorplan={floorplan}
                  density={density}
                  activeLayer={activeLayer}
                  selectedGate={selectedGate}
                  selectedSection={selectedSection}
                  gpsLocation={gpsLocation}
                  setActiveTab={setActiveTab}
                  highlightTarget={highlightTarget}
                  setHighlightTarget={setHighlightTarget}
                />
              </div>
            )}
            {activeTab === 'density' && (
              <div className="w-full h-full max-w-2xl mx-auto flex flex-col min-h-0">
                <DensityPanel
                  density={density}
                  setActiveTab={setActiveTab}
                />
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="shrink-0 border-t border-gray-200 bg-white px-5 py-2 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            CrowdSense AI · FIFA World Cup 2026 · MetLife Stadium, NJ
          </p>
          <p className="text-[10px] text-gray-400">
            Density updates every 5s · FAISS + LangChain + Gemini 2.5 Flash
          </p>
        </footer>
      </div>
    </>
  );
}

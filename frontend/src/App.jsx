// src/App.jsx
import React, { useState } from 'react';
import Header from './components/Header';
import StadiumMap from './components/StadiumMap';
import DensityPanel from './components/DensityPanel';
import FanChatPanel from './components/FanChatPanel';
import { useRealtime } from './hooks/useRealtime';

const LAYERS = ['all', 'restrooms', 'medical', 'food'];

export default function App() {
  const { density, floorplan, loading, error, tickCount } = useRealtime(5000);
  const [activeLayer, setActiveLayer] = useState('all');
  const [activeTab, setActiveTab]     = useState('map'); // mobile tabs: 'map' | 'density' | 'chat'

  // ── Fan location state (lifted so StadiumMap can show "You Are Here") ──
  const [selectedGate,    setSelectedGate]    = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [gpsLocation,     setGpsLocation]     = useState(null);

  return (
    <div className="h-screen flex flex-col bg-navy-950 bg-noise overflow-hidden">
      {/* Background ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-teal-500/5 blur-[80px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-blue-600/5 blur-[80px]" />
      </div>

      {/* Header */}
      <Header density={density} tickCount={tickCount} />

      {/* Error banner */}
      {error && (
        <div className="shrink-0 bg-red-900/30 border-b border-red-500/20 text-red-300 text-xs px-6 py-2 flex items-center gap-2">
          <span className="text-red-400">⚠</span>
          {error} — Is the backend running? (<code className="font-mono">uvicorn main:app --reload --port 8000</code>)
        </div>
      )}

      {/* Layer toggles (above map) */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-white/5">
        <span className="text-[10px] text-slate-500 font-medium mr-1">MAP LAYER:</span>
        {LAYERS.map(layer => (
          <button
            key={layer}
            onClick={() => setActiveLayer(layer)}
            id={`layer-btn-${layer}`}
            className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold uppercase tracking-wide transition-all ${
              activeLayer === layer
                ? 'bg-teal-500 border-teal-400 text-navy-950'
                : 'border-white/10 text-slate-400 hover:text-white hover:border-white/20'
            }`}
          >
            {layer}
          </button>
        ))}

        {/* Mobile tab switcher (right side) */}
        <div className="ml-auto flex lg:hidden items-center gap-1">
          {[['map', '🗺'], ['density', '📊'], ['chat', '💬']].map(([tab, icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                activeTab === tab
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-400'
                  : 'border-white/10 text-slate-500 hover:text-white'
              }`}
            >
              {icon} {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <main className="flex-1 overflow-hidden p-3 gap-3">

        {/* Desktop: 3-column layout (Fan Assistant left, Map center, Density right) */}
        <div className="hidden lg:grid lg:grid-cols-[320px_1fr_300px] gap-3 h-full">
          <FanChatPanel
            floorplan={floorplan}
            selectedGate={selectedGate}
            setSelectedGate={setSelectedGate}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            gpsLocation={gpsLocation}
            setGpsLocation={setGpsLocation}
          />
          <StadiumMap
            floorplan={floorplan}
            density={density}
            activeLayer={activeLayer}
            selectedGate={selectedGate}
            selectedSection={selectedSection}
            gpsLocation={gpsLocation}
          />
          <DensityPanel density={density} />
        </div>

        {/* Mobile: tab-based layout */}
        <div className="lg:hidden h-full">
          {activeTab === 'map' && (
            <StadiumMap
              floorplan={floorplan}
              density={density}
              activeLayer={activeLayer}
              selectedGate={selectedGate}
              selectedSection={selectedSection}
              gpsLocation={gpsLocation}
            />
          )}
          {activeTab === 'density' && (
            <DensityPanel density={density} />
          )}
          {activeTab === 'chat' && (
            <FanChatPanel
              floorplan={floorplan}
              selectedGate={selectedGate}
              setSelectedGate={setSelectedGate}
              selectedSection={selectedSection}
              setSelectedSection={setSelectedSection}
              gpsLocation={gpsLocation}
              setGpsLocation={setGpsLocation}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-white/5 px-6 py-2 flex items-center justify-between">
        <p className="text-[10px] text-slate-600">
          CrowdSense AI · FIFA World Cup 2026 · MetLife Stadium, NJ
        </p>
        <p className="text-[10px] text-slate-600">
          Density updates every 5s · RAG-powered by FAISS + LangChain + Gemini
        </p>
      </footer>
    </div>
  );
}

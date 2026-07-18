import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StadiumMap from '../components/StadiumMap';

const mockFloorplan = {
  gates: [
    { id: 'GATE_A', name: 'Gate A', label: 'A', lat: 40.8135, lng: -74.0743, svgX: 100, svgY: 100 },
    { id: 'GATE_B', name: 'Gate B', label: 'B', lat: 40.8145, lng: -74.0733, svgX: 200, svgY: 200 }
  ],
  sections: [
    { id: 'SEC_101', name: 'Section 101', primary_gate: 'GATE_A', level: 'Lower', zone: 'East', capacity: 250, lat: 40.8136, lng: -74.0742 },
    { id: 'SEC_102', name: 'Section 102', primary_gate: 'GATE_B', level: 'Lower', zone: 'East', capacity: 250, lat: 40.8146, lng: -74.0732 }
  ],
  points_of_interest: {
    restrooms: [],
    medical_points: [],
    food_courts: []
  }
};

const mockDensity = {
  gates: [
    { gate_id: 'GATE_A', current_count: 500, capacity: 1000, pct: 50.0, status: 'moderate', avg_wait_minutes: 5 },
    { gate_id: 'GATE_B', current_count: 950, capacity: 1000, pct: 95.0, status: 'critical', avg_wait_minutes: 25 }
  ]
};

describe('StadiumMap Component', () => {
  it('renders gate markers labels on the map', () => {
    render(
      <StadiumMap
        floorplan={mockFloorplan}
        density={mockDensity}
        activeLayer="all"
        selectedGate=""
        selectedSection=""
        gpsLocation={null}
        setActiveTab={() => {}}
        highlightTarget={null}
        setHighlightTarget={() => {}}
      />
    );
    
    // Assert gate label A and B exist
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders "You are here" marker when location is set via selectedGate', () => {
    render(
      <StadiumMap
        floorplan={mockFloorplan}
        density={mockDensity}
        activeLayer="all"
        selectedGate="GATE_A"
        selectedSection=""
        gpsLocation={null}
        setActiveTab={() => {}}
        highlightTarget={null}
        setHighlightTarget={() => {}}
      />
    );
    
    // "You Are Here" renders "You" text
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders "You are here" approximate marker when highlightTarget is active but no specific location is selected', () => {
    const highlight = { id: 'GATE_B', name: 'Gate B', type: 'gates' };
    render(
      <StadiumMap
        floorplan={mockFloorplan}
        density={mockDensity}
        activeLayer="all"
        selectedGate=""
        selectedSection=""
        gpsLocation={null}
        setActiveTab={() => {}}
        highlightTarget={highlight}
        setHighlightTarget={() => {}}
      />
    );
    
    // Fallback location for "You Are Here" will render "You ~"
    expect(screen.getByText('You ~')).toBeInTheDocument();
  });

  it('does not render "You are here" marker when location and highlightTarget are unset', () => {
    render(
      <StadiumMap
        floorplan={mockFloorplan}
        density={mockDensity}
        activeLayer="all"
        selectedGate=""
        selectedSection=""
        gpsLocation={null}
        setActiveTab={() => {}}
        highlightTarget={null}
        setHighlightTarget={() => {}}
      />
    );
    
    // "You" or "You ~" text should not exist
    expect(screen.queryByText('You')).not.toBeInTheDocument();
    expect(screen.queryByText('You ~')).not.toBeInTheDocument();
  });
});

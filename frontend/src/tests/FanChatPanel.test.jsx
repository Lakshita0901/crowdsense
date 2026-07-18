import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import FanChatPanel from '../components/FanChatPanel';
import * as useRealtime from '../hooks/useRealtime';

// Mock the realtime hooks/API functions
vi.mock('../hooks/useRealtime', () => ({
  fanChat: vi.fn(),
  detectLanguage: vi.fn()
}));

const mockFloorplan = {
  gates: [
    { id: 'GATE_A', name: 'Gate A', lat: 40.8135, lng: -74.0743, svgX: 100, svgY: 100 },
    { id: 'GATE_B', name: 'Gate B', lat: 40.8145, lng: -74.0733, svgX: 200, svgY: 200 }
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

describe('FanChatPanel Component', () => {
  it('renders welcome greeting message', () => {
    render(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate=""
        setSelectedGate={() => {}}
        selectedSection=""
        setSelectedSection={() => {}}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );
    expect(screen.getByText(/Choose your language or start typing/)).toBeInTheDocument();
  });

  it('displays quick suggested question chips', () => {
    render(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate=""
        setSelectedGate={() => {}}
        selectedSection=""
        setSelectedSection={() => {}}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );
    expect(screen.getByText('Nearest restroom to Gate C')).toBeInTheDocument();
  });

  it('handles empty query input gracefully', async () => {
    const mockFanChat = vi.spyOn(useRealtime, 'fanChat');
    render(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate=""
        setSelectedGate={() => {}}
        selectedSection=""
        setSelectedSection={() => {}}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );
    
    // Attempt sending empty input
    const sendBtn = screen.getByRole('button', { name: 'Send Message' });
    fireEvent.click(sendBtn);
    expect(mockFanChat).not.toHaveBeenCalled();
  });

  it('submits query when valid input is typed and submitted', async () => {
    const mockFanChat = vi.spyOn(useRealtime, 'fanChat').mockResolvedValue({
      answer: 'Mock response answer',
      why: 'Mock reason',
      sources: [],
      llm_used: true,
      language: 'en',
      fan_location: null
    });

    render(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate=""
        setSelectedGate={() => {}}
        selectedSection=""
        setSelectedSection={() => {}}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );

    const inputEl = screen.getByPlaceholderText(/Ask me anything/);
    fireEvent.change(inputEl, { target: { value: 'Where is the food court?' } });
    
    const sendBtn = screen.getByRole('button', { name: 'Send Message' });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockFanChat).toHaveBeenCalledWith(
        'Where is the food court?',
        'en',
        '',
        '',
        null,
        expect.any(Number),
        expect.any(Array)
      );
    });
  });

  it('filters section dropdown options based on the selected gate', () => {
    let gateVal = 'GATE_A';
    const setGate = vi.fn((val) => { gateVal = val; });
    let sectionVal = '';
    const setSection = vi.fn((val) => { sectionVal = val; });

    const { rerender } = render(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate={gateVal}
        setSelectedGate={setGate}
        selectedSection={sectionVal}
        setSelectedSection={setSection}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );

    // Section 101 should be rendered as options since selectedGate = GATE_A
    expect(screen.getByText('Section 101')).toBeInTheDocument();
    // Section 102 should NOT be rendered since its primary gate is GATE_B
    expect(screen.queryByText('Section 102')).not.toBeInTheDocument();

    // Now change selectedGate to GATE_B
    gateVal = 'GATE_B';
    rerender(
      <FanChatPanel
        floorplan={mockFloorplan}
        selectedGate={gateVal}
        setSelectedGate={setGate}
        selectedSection={sectionVal}
        setSelectedSection={setSection}
        gpsLocation={null}
        setGpsLocation={() => {}}
        setActiveTab={() => {}}
      />
    );

    expect(screen.getByText('Section 102')).toBeInTheDocument();
    expect(screen.queryByText('Section 101')).not.toBeInTheDocument();
  });
});

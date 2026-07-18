import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OnboardingScreen from '../components/OnboardingScreen';
import MatchBar from '../components/MatchBar';
import FanChatPanel from '../components/FanChatPanel';
import DensityPanel from '../components/DensityPanel';
import * as useRealtime from '../hooks/useRealtime';

// Mock realtime hooks
vi.mock('../hooks/useRealtime', () => ({
  fanChat: vi.fn(),
  detectLanguage: vi.fn()
}));

const mockFloorplan = {
  gates: [
    { id: 'GATE_A', name: 'Gate A', label: 'A', lat: 40.8135, lng: -74.0743, svgX: 100, svgY: 100, direction: 'North' },
    { id: 'GATE_B', name: 'Gate B', label: 'B', lat: 40.8145, lng: -74.0733, svgX: 200, svgY: 200, direction: 'South' }
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
    { gate_id: 'GATE_A', gate_name: 'Gate A', current_count: 100, capacity: 1000, pct: 10.0, status: 'low', trend: 'stable', direction: 'North', avg_wait_minutes: 2 },
    { gate_id: 'GATE_B', gate_name: 'Gate B', current_count: 500, capacity: 1000, pct: 50.0, status: 'moderate', trend: 'rising', direction: 'South', avg_wait_minutes: 8 },
    { gate_id: 'GATE_C', gate_name: 'Gate C', current_count: 800, capacity: 1000, pct: 80.0, status: 'high', trend: 'stable', direction: 'East', avg_wait_minutes: 15 },
    { gate_id: 'GATE_D', gate_name: 'Gate D', current_count: 950, capacity: 1000, pct: 95.0, status: 'critical', trend: 'rising', direction: 'West', avg_wait_minutes: 28 }
  ],
  stadium_totals: {
    total_present: 2350,
    total_capacity: 4000,
    occupancy_pct: 58.75,
    gates_at_critical: 1
  }
};

describe('Additional Frontend Unit Tests', () => {

  describe('OnboardingScreen', () => {
    it('filters sections based on selected gate', () => {
      let selectedGate = 'GATE_A';
      const setSelectedGate = vi.fn();
      let selectedSection = '';
      const setSelectedSection = vi.fn();

      const { rerender } = render(
        <OnboardingScreen
          floorplan={mockFloorplan}
          selectedGate={selectedGate}
          setSelectedGate={setSelectedGate}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
          gpsLocation={null}
          setGpsLocation={() => {}}
          onComplete={() => {}}
        />
      );

      // Section 101 is served by GATE_A (should render)
      expect(screen.getByText('Section 101')).toBeInTheDocument();
      // Section 102 is served by GATE_B (should NOT render)
      expect(screen.queryByText('Section 102')).not.toBeInTheDocument();

      // Change gate selection to GATE_B
      selectedGate = 'GATE_B';
      rerender(
        <OnboardingScreen
          floorplan={mockFloorplan}
          selectedGate={selectedGate}
          setSelectedGate={setSelectedGate}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
          gpsLocation={null}
          setGpsLocation={() => {}}
          onComplete={() => {}}
        />
      );

      expect(screen.getByText('Section 102')).toBeInTheDocument();
      expect(screen.queryByText('Section 101')).not.toBeInTheDocument();
    });

    it('triggers geolocation capture when GPS button is clicked', async () => {
      const mockGeoloc = {
        getCurrentPosition: vi.fn().mockImplementation((success) => {
          success({
            coords: {
              latitude: 40.8135,
              longitude: -74.0743
            }
          });
        })
      };
      vi.stubGlobal('navigator', { geolocation: mockGeoloc });

      const setGps = vi.fn();
      render(
        <OnboardingScreen
          floorplan={mockFloorplan}
          selectedGate=""
          setSelectedGate={() => {}}
          selectedSection=""
          setSelectedSection={() => {}}
          gpsLocation={null}
          setGpsLocation={setGps}
          onComplete={() => {}}
        />
      );

      const gpsBtn = screen.getByRole('button', { name: 'Share my live location' });
      fireEvent.click(gpsBtn);

      await waitFor(() => {
        expect(mockGeoloc.getCurrentPosition).toHaveBeenCalled();
        expect(setGps).toHaveBeenCalledWith({ lat: 40.8135, lng: -74.0743 });
      });
      vi.unstubAllGlobals();
    });

    it('proceeds without location when skip button is clicked', () => {
      const handleComplete = vi.fn();
      render(
        <OnboardingScreen
          floorplan={mockFloorplan}
          selectedGate=""
          setSelectedGate={() => {}}
          selectedSection=""
          setSelectedSection={() => {}}
          gpsLocation={null}
          setGpsLocation={() => {}}
          onComplete={handleComplete}
        />
      );

      const skipBtn = screen.getByRole('button', { name: 'Skip location setup for now' });
      
      vi.useFakeTimers();
      fireEvent.click(skipBtn);
      
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(handleComplete).toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  describe('MatchBar', () => {
    it('renders team names, score, and live pulse status correctly', () => {
      render(<MatchBar />);
      expect(screen.getByText('ARG')).toBeInTheDocument();
      expect(screen.getByText('FRA')).toBeInTheDocument();
      expect(screen.getByText('LIVE')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  describe('FanChatPanel API Error Fallback', () => {
    it('shows reasonable error message on failed chat submission', async () => {
      const mockFanChat = vi.spyOn(useRealtime, 'fanChat').mockRejectedValue(new Error('Backend offline'));

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

      const input = screen.getByPlaceholderText(/Ask me anything/);
      fireEvent.change(input, { target: { value: 'Help me' } });

      const sendBtn = screen.getByRole('button', { name: 'Send Message' });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(mockFanChat).toHaveBeenCalled();
        expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument();
      });
    });
  });

  describe('DensityPanel', () => {
    it('renders gates with their correct live status badges', () => {
      render(<DensityPanel density={mockDensity} setActiveTab={() => {}} />);
      
      // Check labels
      expect(screen.getByText('LOW')).toBeInTheDocument();
      expect(screen.getByText('MOD')).toBeInTheDocument();
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('CRITICAL')).toBeInTheDocument();

      // Check occupancy counts are formatted properly
      expect(screen.getByText('2,350')).toBeInTheDocument();
      expect(screen.getByText('58.8%')).toBeInTheDocument();
    });
  });
});

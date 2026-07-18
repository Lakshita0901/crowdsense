import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LandingScreen from '../components/LandingScreen';

describe('LandingScreen Component', () => {
  it('renders competition name and venue', () => {
    render(<LandingScreen onEnter={() => {}} />);
    expect(screen.getAllByText(/FIFA World Cup 2026/)[0]).toBeInTheDocument();
    expect(screen.getByText(/MetLife Stadium, East Rutherford NJ/)).toBeInTheDocument();
  });

  it('renders Enter Stadium button and navigates on click', () => {
    const handleEnter = vi.fn();
    render(<LandingScreen onEnter={handleEnter} />);
    
    const enterBtn = screen.getByRole('button', { name: /Enter Stadium/ });
    expect(enterBtn).toBeInTheDocument();
    
    vi.useFakeTimers();
    fireEvent.click(enterBtn);
    
    act(() => {
      vi.advanceTimersByTime(400);
    });
    
    expect(handleEnter).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

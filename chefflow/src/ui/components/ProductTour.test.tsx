import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ProductTour from './ProductTour';
import { useTourState, TOTAL_STEPS } from '../../state/useTourState';

beforeEach(() => {
  window.localStorage.clear();
  useTourState.setState({ active: false, step: 0 });
  cleanup();
});

describe('ProductTour', () => {
  it('renders nothing when the tour is not active', () => {
    const { container } = render(<ProductTour />);
    expect(container.firstChild).toBeNull();
  });

  it('renders step 0 with title + body + Next + Skip when activated', () => {
    useTourState.getState().start();
    render(<ProductTour />);
    expect(screen.getByTestId('product-tour-step-0')).toBeInTheDocument();
    // Step 0 is the Recipes step.
    expect(screen.getByRole('heading', { name: /recipe library/i })).toBeInTheDocument();
    expect(screen.getByTestId('product-tour-next')).toBeInTheDocument();
    expect(screen.getByTestId('product-tour-skip')).toBeInTheDocument();
  });

  it('Skip dismisses the tour AND sets the localStorage flag', () => {
    useTourState.getState().start();
    render(<ProductTour />);
    fireEvent.click(screen.getByTestId('product-tour-skip'));
    expect(useTourState.getState().active).toBe(false);
    expect(window.localStorage.getItem('chefflow:tour-dismissed-v1')).toBe('1');
  });

  it('Next advances through all steps to the final "Got it" card', () => {
    useTourState.getState().start();
    const { rerender } = render(<ProductTour />);
    for (let i = 0; i < TOTAL_STEPS; i++) {
      expect(screen.getByTestId(`product-tour-step-${i}`)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('product-tour-next'));
      rerender(<ProductTour />);
    }
    // Final card replaces the spotlight with a centred "Got it" panel.
    expect(screen.getByTestId('product-tour-final')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-tour-finish'));
    expect(useTourState.getState().active).toBe(false);
    expect(window.localStorage.getItem('chefflow:tour-dismissed-v1')).toBe('1');
  });
});

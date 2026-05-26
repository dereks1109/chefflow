import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommunityDisclaimerBanner from './CommunityDisclaimerBanner';

afterEach(() => cleanup());

function renderBanner(variant?: 'full' | 'compact') {
  return render(
    <MemoryRouter>
      <CommunityDisclaimerBanner variant={variant} />
    </MemoryRouter>,
  );
}

describe('CommunityDisclaimerBanner', () => {
  it('defaults to the full variant and surfaces the food-operator framing', () => {
    renderBanner();
    expect(screen.getByTestId('community-disclaimer-full')).toBeTruthy();
    const text = screen.getByTestId('community-disclaimer-full').textContent ?? '';
    expect(text).toContain('Community recipes are author-declared');
    expect(text).toContain('Food Information Regulations 2014');
  });

  it('renders the compact variant when asked', () => {
    renderBanner('compact');
    expect(screen.getByTestId('community-disclaimer-compact')).toBeTruthy();
    expect(screen.queryByTestId('community-disclaimer-full')).toBeNull();
  });

  it('links "See Disclaimer" to /disclaimer in both variants', () => {
    renderBanner('full');
    const fullLink = screen.getAllByText('See Disclaimer')[0].closest('a');
    expect(fullLink?.getAttribute('href')).toBe('/disclaimer');
    cleanup();
    renderBanner('compact');
    const compactLink = screen.getAllByText('See Disclaimer')[0].closest('a');
    expect(compactLink?.getAttribute('href')).toBe('/disclaimer');
  });
});

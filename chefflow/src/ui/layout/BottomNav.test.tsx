import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomNav from './BottomNav';

function renderNav(initialEntries: string[] = ['/recipes']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <BottomNav />
    </MemoryRouter>
  );
}

describe('BottomNav', () => {
  it('renders all four primary tabs', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /recipes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /events/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /workflows/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /community/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(4);
  });

  it('links each tab to the correct route', () => {
    renderNav();
    expect(screen.getByRole('link', { name: /recipes/i })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: /events/i })).toHaveAttribute('href', '/events');
    expect(screen.getByRole('link', { name: /workflows/i })).toHaveAttribute('href', '/workflows');
    expect(screen.getByRole('link', { name: /community/i })).toHaveAttribute('href', '/community');
  });

  it('is hidden at lg and up (mobile-only)', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(nav.className).toContain('lg:hidden');
  });

  it('marks the active route with aria-current=page', () => {
    renderNav(['/community']);
    const communityLink = screen.getByRole('link', { name: /community/i });
    expect(communityLink).toHaveAttribute('aria-current', 'page');
  });
});

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import EventDetailCard from './EventDetailCard';
import { useAllergyKeywordsStore } from '../../state/useAllergyKeywordsStore';
import type { KitchenEvent } from '../../core/types';

function mkEvent(over: Partial<KitchenEvent> = {}): KitchenEvent {
  return {
    id: 'e1',
    title: 'Birthday dinner',
    serveAt: '2026-06-01T19:00:00.000Z',
    notes: '',
    dishes: [],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  };
}

function renderCard(event: KitchenEvent) {
  return render(
    <MemoryRouter>
      <EventDetailCard event={event} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAllergyKeywordsStore.setState({ extras: [] });
});
afterEach(() => cleanup());

describe('EventDetailCard — allergy keyword banner', () => {
  it('hidden when notes have no allergy keywords', () => {
    renderCard(mkEvent({ notes: '8 guests for a birthday dinner. Casual ambience.' }));
    expect(screen.queryByTestId('event-detail-allergy-banner')).toBeNull();
  });

  it('appears with a count when notesOriginal contains allergy keywords', () => {
    renderCard(mkEvent({
      notes: 'Vegetarians\nPeanut allergy',
      notesOriginal: 'Two guests are vegetarian. Carla has a strict peanut allergy.',
    }));
    const banner = screen.getByTestId('event-detail-allergy-banner');
    expect(banner).toBeTruthy();
    // "strict" + "allergy" are the default keywords that should match.
    const strongCount = banner.querySelector('strong');
    expect(Number(strongCount?.textContent)).toBeGreaterThanOrEqual(2);
    expect(banner.textContent).toContain('customer email');
  });

  it('falls back to scanning `notes` when notesOriginal is absent (manual-entry events)', () => {
    renderCard(mkEvent({ notes: 'Severe nut allergy. Strict no peanuts.' }));
    const banner = screen.getByTestId('event-detail-allergy-banner');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('notes');
  });

  it('chef extras from the store add to the count', () => {
    useAllergyKeywordsStore.setState({ extras: ['celiac'] });
    renderCard(mkEvent({ notes: 'Guest is celiac.' }));
    const banner = screen.getByTestId('event-detail-allergy-banner');
    const strongCount = banner.querySelector('strong');
    // 'celiac' isn't a default; without the extra the banner would be hidden.
    expect(Number(strongCount?.textContent)).toBe(1);
  });
});

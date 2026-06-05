import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommunityLibrary from './CommunityLibrary';

const listMock = vi.fn();

vi.mock('../../core/community/communityClient', () => ({
  listCommunityRecipes: () => listMock(),
}));

beforeEach(() => {
  listMock.mockReset();
});

describe('CommunityLibrary', () => {
  it('shows empty state when no recipes are returned', async () => {
    listMock.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByText(/No shared recipes yet/i)).toBeInTheDocument();
    });
  });

  it('renders a card per recipe with title, author, like and copy counts', async () => {
    listMock.mockResolvedValue([
      { id: 'cr_a', title: 'Beef Stew', authorDisplayName: 'Alice', likes: 3, copies: 1, publishedAt: 0 },
      { id: 'cr_b', title: 'Vegan Pho', authorDisplayName: 'Bob', likes: 5, copies: 2, publishedAt: 0 },
    ]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const beef = screen.getAllByRole('link', { name: /beef stew/i });
      expect(beef.length).toBeGreaterThan(0);
      expect(beef[0]).toHaveAttribute('href', '/community/cr_a');
    });
    const pho = screen.getAllByRole('link', { name: /vegan pho/i });
    expect(pho[0]).toHaveAttribute('href', '/community/cr_b');
    expect(screen.getByText(/by Alice/)).toBeInTheDocument();
    expect(screen.getByText(/by Bob/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  // Reddit feedback (Jun 2026): chefs saw Safari's verbatim "Load failed"
  // string and read it as a bug. Now the raw fetch / worker error is
  // translated through friendlyCommunityError(...) into chef-readable
  // copy, AND the error state surfaces a Try-again button instead of
  // dead-ending the chef.

  it('network failure renders connection-prompt copy, not the raw "Load failed" string', async () => {
    // Safari's TypeError shows "Load failed"; Chrome shows "Failed to fetch".
    listMock.mockRejectedValue(new Error('Load failed'));
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/check your connection/i);
    });
    expect(screen.queryByText(/Load failed/)).toBeNull();
  });

  it('worker 5xx renders the temporarily-unavailable copy', async () => {
    listMock.mockRejectedValue(new Error('Community worker 503'));
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/temporarily unavailable/i);
    });
  });

  it('Try again button re-fires the fetch and recovers when the next call succeeds', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    // First call fails, second resolves to empty list.
    listMock
      .mockRejectedValueOnce(new Error('Load failed'))
      .mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    // Error state appears first.
    const retry = await screen.findByTestId('community-retry');
    expect(retry).toBeInTheDocument();
    // Clicking retry re-runs the effect → empty-state heading appears.
    await user.click(retry);
    await waitFor(() => {
      expect(screen.getByText(/No shared recipes yet/i)).toBeInTheDocument();
    });
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it('renders the bundled demo cover photo when a community summary points back at a known demo via sourceLocalId', async () => {
    // (Demo) Ribeye published to community: coverPhoto is empty (worker
    // payload stays lean), sourceLocalId carries the original demo id so
    // the card's resolveCoverPhoto() can fall back to the bundled JPEG.
    listMock.mockResolvedValue([
      {
        id: 'cr_ribeye',
        sourceLocalId: 'r_demo_ribeye',
        title: '(Demo) Ribeye',
        coverPhoto: '',
        authorDisplayName: 'Alice',
        likes: 0,
        copies: 0,
        publishedAt: 0,
      },
    ]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      const img = screen.getByTestId('community-card-cover-photo-img');
      // The bundled JPEG comes through Vite as a base64 data URL or a
      // hashed asset path. We only assert it's present + non-empty —
      // anything else would couple the test to Vite output.
      expect(img.getAttribute('src')).toBeTruthy();
      expect(img.getAttribute('src')?.length).toBeGreaterThan(0);
    });
  });

  it('does NOT render an AllergenPill on a community card, even when the summary carries a (now-deprecated) tags.allergens field', async () => {
    // Allergen pills were removed from the community surface to avoid
    // ChefFlow making an allergen claim about another chef's recipe.
    // The summary type no longer carries allergens; if a stale cache
    // still does, the card must still not render the pill.
    listMock.mockResolvedValue([
      {
        id: 'cr_dumpling',
        sourceLocalId: 'r_demo_dumplings',
        title: '(Demo) Steamed Vegetable Dumplings',
        authorDisplayName: 'Alice',
        likes: 0,
        copies: 0,
        publishedAt: 0,
        // Stale-cache simulation — the type no longer accepts allergens.
        tags: { allergens: ['gluten'] } as unknown as { keyIngredientTags?: string[] },
      },
    ]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      // The card itself is on screen — wait for the title to confirm.
      expect(screen.getByText(/Steamed Vegetable Dumplings/i)).toBeInTheDocument();
    });
    // No allergen tooltip surface, no "Declared at recipe level" copy.
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByText(/Declared at recipe level/i)).toBeNull();
  });

});

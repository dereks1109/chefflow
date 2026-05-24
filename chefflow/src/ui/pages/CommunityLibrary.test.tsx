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

  it('renders an error state when the worker fails', async () => {
    listMock.mockRejectedValue(new Error('worker down'));
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/worker down/);
    });
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

  it('AllergenPill in the community card renders its tooltip element even when no ingredient data is on the summary', async () => {
    // Pre-fix the pill had no hoverable surface for tag-only summaries.
    // Now the tooltip span is always in the DOM so chefs can hover.
    listMock.mockResolvedValue([
      {
        id: 'cr_dumpling',
        sourceLocalId: 'r_demo_dumplings',
        title: '(Demo) Steamed Vegetable Dumplings',
        authorDisplayName: 'Alice',
        likes: 0,
        copies: 0,
        publishedAt: 0,
        tags: { allergens: ['gluten'] },
      },
    ]);
    render(
      <MemoryRouter>
        <CommunityLibrary />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      expect(screen.getByText(/Declared at recipe level/i)).toBeInTheDocument();
    });
  });
});

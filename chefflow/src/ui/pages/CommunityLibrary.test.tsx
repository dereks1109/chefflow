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
});

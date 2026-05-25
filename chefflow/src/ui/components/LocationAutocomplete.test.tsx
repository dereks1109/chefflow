import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const loadMock = vi.fn();

vi.mock('../../core/util/googleMapsLoader', () => ({
  loadGoogleMapsPlaces: (key: string) => loadMock(key),
}));

import LocationAutocomplete from './LocationAutocomplete';

interface MutableWindow {
  google?: unknown;
}

beforeEach(() => {
  loadMock.mockReset();
  (import.meta.env as Record<string, string>).VITE_GOOGLE_MAPS_API_KEY = 'test-key';
  delete (window as unknown as MutableWindow).google;
});

afterEach(() => {
  cleanup();
  delete (window as unknown as MutableWindow).google;
});

describe('LocationAutocomplete', () => {
  it('falls back to a plain text input with an inline note when Places fails to load', async () => {
    loadMock.mockRejectedValueOnce(new Error('referrer blocked'));

    const handleChange = vi.fn();
    render(<LocationAutocomplete value="" onChange={handleChange} />);

    await waitFor(() => {
      expect(
        screen.getByText(/address suggestions unavailable/i),
      ).toBeInTheDocument();
    });

    const input = screen.getByRole('textbox', { name: /location/i });
    expect(input).toHaveAttribute('aria-autocomplete', 'none');

    await userEvent.type(input, 'Paris');
    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.calls.at(-1)?.[0]).toBe('s');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('attaches autocomplete and shows no fallback note when Places loads successfully', async () => {
    (window as unknown as MutableWindow).google = {
      maps: {
        places: {
          AutocompleteSuggestion: {
            fetchAutocompleteSuggestions: vi.fn().mockResolvedValue({ suggestions: [] }),
          },
          AutocompleteSessionToken: function () {
            return {};
          },
        },
      },
    };
    loadMock.mockResolvedValueOnce(undefined);

    render(<LocationAutocomplete value="" onChange={() => {}} />);

    const input = await screen.findByRole('textbox', { name: /location/i });
    await waitFor(() => {
      expect(input).toHaveAttribute('aria-autocomplete', 'list');
    });
    expect(screen.queryByText(/address suggestions unavailable/i)).toBeNull();
  });
});

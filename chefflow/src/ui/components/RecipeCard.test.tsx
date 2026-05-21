import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import RecipeCard from './RecipeCard';
import { downscaleToDataUrl } from '../../core/util/image';
import type { Recipe } from '../../core/types';

vi.mock('../../core/util/image', () => ({
  downscaleToDataUrl: vi.fn(async () => 'data:image/jpeg;base64,STUB'),
}));

beforeEach(() => {
  vi.mocked(downscaleToDataUrl).mockClear();
});

const base: Recipe = {
  id: 'r_test_card',
  title: 'Card Recipe',
  originalYield: 2,
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

interface RenderOptions {
  recipe?: Recipe;
  onCoverPhotoChange?: (next: string | undefined) => void;
}

function renderCard(opts: RenderOptions = {}) {
  const recipe = opts.recipe ?? base;
  return render(
    <MemoryRouter>
      <RecipeCard
        recipe={recipe}
        onTogglePin={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCoverPhotoChange={opts.onCoverPhotoChange}
      />
    </MemoryRouter>
  );
}

describe('RecipeCard — cover photo', () => {
  it('renders cover photo when coverPhoto is set', () => {
    renderCard({ recipe: { ...base, coverPhoto: 'data:image/jpeg;base64,COVER' } });
    const img = screen.getByTestId('recipe-card-cover-photo-img') as HTMLImageElement;
    expect(img.src).toBe('data:image/jpeg;base64,COVER');
  });

  it('renders placeholder banner when coverPhoto is unset', () => {
    renderCard();
    expect(screen.queryByTestId('recipe-card-cover-photo-img')).toBeNull();
    expect(screen.getByTestId('recipe-card-cover-placeholder')).toBeTruthy();
  });

  it('renders placeholder banner when coverPhoto is empty string', () => {
    renderCard({ recipe: { ...base, coverPhoto: '' } });
    expect(screen.queryByTestId('recipe-card-cover-photo-img')).toBeNull();
    expect(screen.getByTestId('recipe-card-cover-placeholder')).toBeTruthy();
  });

  it('cover photo alt text includes the recipe title', () => {
    renderCard({ recipe: { ...base, title: 'Beef Wellington', coverPhoto: 'data:image/jpeg;base64,X' } });
    const img = screen.getByTestId('recipe-card-cover-photo-img');
    expect(img).toHaveAttribute('alt', 'Beef Wellington cover photo');
  });

  it('cover photo alt text falls back to "Recipe" when title is empty', () => {
    renderCard({ recipe: { ...base, title: '', coverPhoto: 'data:image/jpeg;base64,X' } });
    const img = screen.getByTestId('recipe-card-cover-photo-img');
    expect(img).toHaveAttribute('alt', 'Recipe cover photo');
  });
});

describe('RecipeCard — overflow menu cover-photo actions', () => {
  it('shows "Add photo" when no coverPhoto and triggers the picker on click', async () => {
    const onChange = vi.fn();
    renderCard({ onCoverPhotoChange: onChange });

    await userEvent.click(screen.getByRole('button', { name: /recipe actions/i }));
    const pickBtn = screen.getByTestId('recipe-card-cover-pick');
    expect(pickBtn).toHaveTextContent('Add photo');
    expect(screen.queryByTestId('recipe-card-cover-clear')).toBeNull();

    const input = screen.getByTestId('recipe-card-cover-input') as HTMLInputElement;
    const file = new File(['x'], 'cover.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(downscaleToDataUrl).toHaveBeenCalledWith(file, 1600);
    });
    expect(onChange).toHaveBeenCalledWith('data:image/jpeg;base64,STUB');
  });

  it('shows "Change photo" and "Remove photo" when coverPhoto is set', async () => {
    renderCard({
      recipe: { ...base, coverPhoto: 'data:image/jpeg;base64,EXISTING' },
      onCoverPhotoChange: vi.fn(),
    });

    await userEvent.click(screen.getByRole('button', { name: /recipe actions/i }));
    expect(screen.getByTestId('recipe-card-cover-pick')).toHaveTextContent('Change photo');
    expect(screen.getByTestId('recipe-card-cover-clear')).toHaveTextContent('Remove photo');
  });

  it('clicking "Remove photo" fires onCoverPhotoChange(undefined)', async () => {
    const onChange = vi.fn();
    renderCard({
      recipe: { ...base, coverPhoto: 'data:image/jpeg;base64,EXISTING' },
      onCoverPhotoChange: onChange,
    });

    await userEvent.click(screen.getByRole('button', { name: /recipe actions/i }));
    await userEvent.click(screen.getByTestId('recipe-card-cover-clear'));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

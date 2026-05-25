import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateMenuSheet from './CreateMenuSheet';
import type { Menu, Recipe } from '../../core/types';

const stew: Recipe = {
  id: 'r_test_001',
  title: 'Beef Stew',
  originalYield: 4,
  ingredients: [],
  steps: [],
  createdAt: 1,
  updatedAt: 1,
};

const cake: Recipe = {
  id: 'r_test_002',
  title: 'Chocolate Cake',
  originalYield: 8,
  ingredients: [],
  steps: [],
  createdAt: 2,
  updatedAt: 2,
};

describe('CreateMenuSheet', () => {
  it('renders nothing when closed', () => {
    render(
      <CreateMenuSheet
        open={false}
        onClose={() => {}}
        recipes={[stew]}
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders dialog and lists the selected recipes when open', () => {
    render(
      <CreateMenuSheet
        open
        onClose={() => {}}
        recipes={[stew, cake]}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const list = screen.getByTestId('create-menu-recipe-list');
    expect(list).toHaveTextContent('Beef Stew');
    expect(list).toHaveTextContent('Chocolate Cake');
    expect(screen.getByText(/2 recipes selected/i)).toBeInTheDocument();
  });

  it('disables Confirm when the title is empty and enables it once filled', async () => {
    render(
      <CreateMenuSheet
        open
        onClose={() => {}}
        recipes={[stew]}
        onConfirm={() => {}}
      />
    );
    const confirm = screen.getByTestId('create-menu-confirm');
    expect(confirm).toBeDisabled();
    const titleInput = screen.getByTestId('create-menu-title-input');
    await userEvent.type(titleInput, 'Saturday Service');
    expect(confirm).toBeEnabled();
  });

  it('description is optional — Confirm omits description when empty', async () => {
    const onConfirm = vi.fn<(m: Menu) => void>();
    render(
      <CreateMenuSheet
        open
        onClose={() => {}}
        recipes={[stew]}
        defaultTitle="Brunch"
        onConfirm={onConfirm}
      />
    );
    await userEvent.click(screen.getByTestId('create-menu-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const menu = onConfirm.mock.calls[0][0];
    expect(menu.title).toBe('Brunch');
    expect(menu.description).toBeUndefined();
  });

  it('Confirm builds a Menu with recipe ids in the selection order', async () => {
    const onConfirm = vi.fn<(m: Menu) => void>();
    render(
      <CreateMenuSheet
        open
        onClose={() => {}}
        recipes={[stew, cake]}
        defaultTitle="Dinner Party"
        onConfirm={onConfirm}
      />
    );
    await userEvent.type(
      screen.getByTestId('create-menu-description-input'),
      'House favourites'
    );
    await userEvent.click(screen.getByTestId('create-menu-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const menu = onConfirm.mock.calls[0][0];
    expect(menu.title).toBe('Dinner Party');
    expect(menu.description).toBe('House favourites');
    expect(menu.recipeIds).toEqual(['r_test_001', 'r_test_002']);
    expect(menu.id).toMatch(/^m_/);
    expect(typeof menu.createdAt).toBe('number');
    expect(typeof menu.updatedAt).toBe('number');
  });

  it('calls onClose when the Cancel button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <CreateMenuSheet
        open
        onClose={onClose}
        recipes={[stew]}
        onConfirm={() => {}}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

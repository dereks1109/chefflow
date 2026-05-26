import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RecipeSaveAttestationModal from './RecipeSaveAttestationModal';

afterEach(() => cleanup());

function renderModal(props: { open: boolean; onCancel?: () => void; onConfirm?: () => void }) {
  return render(
    <MemoryRouter>
      <RecipeSaveAttestationModal
        open={props.open}
        onCancel={props.onCancel ?? (() => {})}
        onConfirm={props.onConfirm ?? (() => {})}
      />
    </MemoryRouter>,
  );
}

describe('RecipeSaveAttestationModal', () => {
  it('does not render when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('recipe-save-attest-modal')).toBeNull();
  });

  it('renders the hygiene-not-our-service framing + a Disclaimer link', () => {
    renderModal({ open: true });
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('not a hygiene-certification');
    const link = dialog.querySelector('a[href="/disclaimer"]');
    expect(link).not.toBeNull();
  });

  it('Save button is disabled until the checkbox is ticked', () => {
    const onConfirm = vi.fn();
    renderModal({ open: true, onConfirm });
    const save = screen.getByTestId('recipe-save-attest-confirm') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('recipe-save-attest-check'));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel button fires onCancel from both the bottom button and the corner X', () => {
    const onCancel = vi.fn();
    renderModal({ open: true, onCancel });
    fireEvent.click(screen.getByTestId('recipe-save-attest-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('recipe-save-attest-cancel-x'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

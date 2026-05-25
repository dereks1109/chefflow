import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import AllergenAttestationModal from './AllergenAttestationModal';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('AllergenAttestationModal', () => {
  it('renders the detected allergen tags', () => {
    render(
      <AllergenAttestationModal
        allergens={['milk', 'gluten', 'nuts']}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const list = screen.getByTestId('attestation-allergen-list');
    expect(list.textContent).toContain('milk');
    expect(list.textContent).toContain('gluten');
    expect(list.textContent).toContain('nuts');
  });

  it('shows the "none detected — still your responsibility" copy when allergens is empty', () => {
    render(<AllergenAttestationModal allergens={[]} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('allergen-attestation-modal').textContent).toContain('None detected');
  });

  it('disables Publish until the attestation checkbox is ticked', () => {
    const onConfirm = vi.fn();
    render(<AllergenAttestationModal allergens={['milk']} onConfirm={onConfirm} onCancel={() => {}} />);
    const confirm = screen.getByTestId('allergen-attestation-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('allergen-attestation-checkbox'));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<AllergenAttestationModal allergens={['milk']} onConfirm={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('allergen-attestation-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

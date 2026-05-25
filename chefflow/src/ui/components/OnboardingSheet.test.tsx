import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import OnboardingSheet from './OnboardingSheet';
import { useProfileStore } from '../../state/useProfileStore';

const completeOnboardingMock = vi.hoisted(() => vi.fn());
vi.mock('../../core/onboarding/onboardingClient', () => ({
  completeOnboarding: completeOnboardingMock,
}));

beforeEach(() => {
  useProfileStore.getState().clear();
  completeOnboardingMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('OnboardingSheet', () => {
  it('saves the typed displayName + toggle to useProfileStore and calls completeOnboarding with the fields', async () => {
    completeOnboardingMock.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    fireEvent.change(screen.getByTestId('onboarding-name-input'), { target: { value: 'Alice Chef' } });
    fireEvent.click(screen.getByTestId('onboarding-show-name'));
    fireEvent.click(screen.getByTestId('onboarding-save'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('Alice Chef');
    expect(useProfileStore.getState().showNameOnCommunity).toBe(true);
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    expect(completeOnboardingMock.mock.calls[0][0].fields).toEqual({
      displayName: 'Alice Chef',
      showNameOnCommunity: true,
    });
  });

  it('Skip sends empty fields and does NOT write to useProfileStore', async () => {
    completeOnboardingMock.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    // User typed a name but then clicks Skip — should NOT save the draft
    fireEvent.change(screen.getByTestId('onboarding-name-input'), { target: { value: 'changed mind' } });
    fireEvent.click(screen.getByTestId('onboarding-skip'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('');
    expect(completeOnboardingMock.mock.calls[0][0].fields).toEqual({});
  });

  it('shows an error and keeps the sheet open when completeOnboarding throws', async () => {
    completeOnboardingMock.mockRejectedValue(new Error('HTTP 500'));
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    fireEvent.click(screen.getByTestId('onboarding-save'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-error').textContent).toContain('HTTP 500');
    });
    expect(onDone).not.toHaveBeenCalled();
    // The save button should be re-enabled so the user can retry.
    expect((screen.getByTestId('onboarding-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('trims whitespace from displayName — only stores the trimmed value', async () => {
    completeOnboardingMock.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    fireEvent.change(screen.getByTestId('onboarding-name-input'), { target: { value: '  Bob  ' } });
    fireEvent.click(screen.getByTestId('onboarding-save'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('Bob');
    expect(completeOnboardingMock.mock.calls[0][0].fields.displayName).toBe('Bob');
  });
});

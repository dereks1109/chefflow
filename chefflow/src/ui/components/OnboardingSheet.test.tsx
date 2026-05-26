import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import OnboardingSheet from './OnboardingSheet';
import { useProfileStore } from '../../state/useProfileStore';
import {
  CURRENT_TOS_VERSION,
  CURRENT_DISCLAIMER_VERSION,
} from '../../core/legal/versions';

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

function tickAcceptance() {
  fireEvent.click(screen.getByTestId('onboarding-tos-accept'));
}

describe('OnboardingSheet', () => {
  it('saves the typed displayName + toggle to useProfileStore and calls completeOnboarding with the fields (incl. ToS)', async () => {
    completeOnboardingMock.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    fireEvent.change(screen.getByTestId('onboarding-name-input'), { target: { value: 'Alice Chef' } });
    fireEvent.click(screen.getByTestId('onboarding-show-name'));
    tickAcceptance();
    fireEvent.click(screen.getByTestId('onboarding-save'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('Alice Chef');
    expect(useProfileStore.getState().showNameOnCommunity).toBe(true);
    expect(completeOnboardingMock).toHaveBeenCalledTimes(1);
    const fields = completeOnboardingMock.mock.calls[0][0].fields;
    expect(fields.displayName).toBe('Alice Chef');
    expect(fields.showNameOnCommunity).toBe(true);
    expect(fields.tosVersion).toBe(CURRENT_TOS_VERSION);
    expect(fields.disclaimerVersion).toBe(CURRENT_DISCLAIMER_VERSION);
    expect(typeof fields.tosAcceptedAt).toBe('string');
    expect(Number.isFinite(Date.parse(fields.tosAcceptedAt))).toBe(true);
  });

  it('Skip sends ToS fields without profile slice and does NOT write to useProfileStore', async () => {
    completeOnboardingMock.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    // User typed a name but then clicks Skip — should NOT save the draft
    fireEvent.change(screen.getByTestId('onboarding-name-input'), { target: { value: 'changed mind' } });
    tickAcceptance();
    fireEvent.click(screen.getByTestId('onboarding-skip'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('');
    const fields = completeOnboardingMock.mock.calls[0][0].fields;
    expect(fields.displayName).toBeUndefined();
    expect(fields.showNameOnCommunity).toBeUndefined();
    expect(fields.tosVersion).toBe(CURRENT_TOS_VERSION);
    expect(fields.disclaimerVersion).toBe(CURRENT_DISCLAIMER_VERSION);
  });

  it('Skip and Save are BOTH disabled until the ToS checkbox is ticked', async () => {
    render(<OnboardingSheet onDone={vi.fn()} />);

    const save = screen.getByTestId('onboarding-save') as HTMLButtonElement;
    const skip = screen.getByTestId('onboarding-skip') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(skip.disabled).toBe(true);

    tickAcceptance();
    expect(save.disabled).toBe(false);
    expect(skip.disabled).toBe(false);

    // Untick again — both go back to disabled.
    tickAcceptance();
    expect(save.disabled).toBe(true);
    expect(skip.disabled).toBe(true);
  });

  it('Terms + Disclaimer links point to /terms and /disclaimer and open in a new tab', () => {
    render(<OnboardingSheet onDone={vi.fn()} />);

    const tosLink = screen.getByTestId('onboarding-tos-link') as HTMLAnchorElement;
    const disclaimerLink = screen.getByTestId('onboarding-disclaimer-link') as HTMLAnchorElement;
    expect(tosLink.getAttribute('href')).toBe('/terms');
    expect(tosLink.getAttribute('target')).toBe('_blank');
    expect(disclaimerLink.getAttribute('href')).toBe('/disclaimer');
    expect(disclaimerLink.getAttribute('target')).toBe('_blank');
  });

  it('shows an error and keeps the sheet open when completeOnboarding throws', async () => {
    completeOnboardingMock.mockRejectedValue(new Error('HTTP 500'));
    const onDone = vi.fn();
    render(<OnboardingSheet onDone={onDone} />);

    tickAcceptance();
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
    tickAcceptance();
    fireEvent.click(screen.getByTestId('onboarding-save'));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(useProfileStore.getState().displayName).toBe('Bob');
    expect(completeOnboardingMock.mock.calls[0][0].fields.displayName).toBe('Bob');
  });
});

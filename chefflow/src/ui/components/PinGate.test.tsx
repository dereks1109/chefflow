import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Override the global @clerk/clerk-react mock so useUser returns a chef
// with a primary email — the recovery flow relies on it for the "code
// sent to xxx" copy.
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: { primaryEmailAddress: { emailAddress: 'chef@example.com' } },
  }),
}));

// Mock the recovery client so tests don't hit the worker.
const requestMock = vi.hoisted(() => vi.fn(async () => ({ emailHint: 'ch••@example.com' })));
const verifyMock = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock('../../core/pin/pinRecoveryClient', () => ({
  requestPinRecovery: requestMock,
  verifyPinRecovery: verifyMock,
  PinRecoveryError: class extends Error {
    readonly status: number;
    readonly reason?: string;
    constructor(message: string, status: number, reason?: string) {
      super(message);
      this.status = status;
      this.reason = reason;
    }
  },
}));

import PinGate from './PinGate';
import { usePinStore } from '../../state/usePinStore';

async function setStorePinSetButLocked() {
  // Set a PIN then re-lock so the gate fires.
  await usePinStore.getState().setPin('1234');
  usePinStore.getState().lock();
}

beforeEach(() => {
  // Reset PIN store between tests so persisted state from one test
  // doesn't bleed into another.
  usePinStore.getState().clearPin();
  requestMock.mockClear();
  requestMock.mockResolvedValue({ emailHint: 'ch••@example.com' });
  verifyMock.mockClear();
  verifyMock.mockResolvedValue({ ok: true });
});

describe('PinGate forgot flow', () => {
  it('Forgot PIN? → Send code calls requestPinRecovery + advances to the verify step', async () => {
    await setStorePinSetButLocked();
    render(<PinGate><div>protected</div></PinGate>);

    fireEvent.click(screen.getByTestId('pin-gate-forgot'));
    fireEvent.click(screen.getByTestId('pin-gate-forgot-send'));

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(1));
    // Step-2 input is rendered post-send.
    expect(screen.getByTestId('pin-gate-forgot-code')).toBeTruthy();
    // The masked email-hint copy appears.
    expect(screen.getByTestId('pin-gate-forgot-info').textContent).toContain('ch••@example.com');
  });

  it('Verify & clear PIN on a valid code → calls verifyPinRecovery + clears local PIN (modal unmounts)', async () => {
    await setStorePinSetButLocked();
    const { container } = render(<PinGate><div data-testid="behind">protected</div></PinGate>);

    fireEvent.click(screen.getByTestId('pin-gate-forgot'));
    fireEvent.click(screen.getByTestId('pin-gate-forgot-send'));
    await waitFor(() => screen.getByTestId('pin-gate-forgot-code'));
    fireEvent.change(screen.getByTestId('pin-gate-forgot-code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('pin-gate-forgot-confirm'));

    await waitFor(() => expect(verifyMock).toHaveBeenCalledWith('123456'));
    // clearPin() flips isPinSet=false → modal goes, protected content appears.
    await waitFor(() => expect(container.querySelector('[data-testid="behind"]')).toBeTruthy());
    expect(usePinStore.getState().isPinSet()).toBe(false);
  });

  it('Invalid code: shows the same generic "Invalid or expired code" message regardless of underlying failure (no enumeration)', async () => {
    const { PinRecoveryError } = await import('../../core/pin/pinRecoveryClient');
    verifyMock.mockRejectedValueOnce(new PinRecoveryError('Invalid or expired code.', 400, 'bad-code'));
    await setStorePinSetButLocked();
    render(<PinGate><div>x</div></PinGate>);
    fireEvent.click(screen.getByTestId('pin-gate-forgot'));
    fireEvent.click(screen.getByTestId('pin-gate-forgot-send'));
    await waitFor(() => screen.getByTestId('pin-gate-forgot-code'));
    fireEvent.change(screen.getByTestId('pin-gate-forgot-code'), { target: { value: '999999' } });
    fireEvent.click(screen.getByTestId('pin-gate-forgot-confirm'));

    await waitFor(() => expect(screen.getByTestId('pin-gate-forgot-error').textContent).toMatch(/Invalid or expired code/i));
    // PIN remains set; chef can try again or resend.
    expect(usePinStore.getState().isPinSet()).toBe(true);
  });

  it('Send-step error: surfaces a friendly message when the rate-limit fires (429)', async () => {
    const { PinRecoveryError } = await import('../../core/pin/pinRecoveryClient');
    requestMock.mockRejectedValueOnce(new PinRecoveryError('Too many recovery attempts — try again in an hour.', 429, 'rate-limited'));
    await setStorePinSetButLocked();
    render(<PinGate><div>x</div></PinGate>);
    fireEvent.click(screen.getByTestId('pin-gate-forgot'));
    fireEvent.click(screen.getByTestId('pin-gate-forgot-send'));
    await waitFor(() => expect(screen.getByTestId('pin-gate-forgot-error').textContent).toMatch(/too many recovery attempts/i));
    // Still on the send step (didn't advance).
    expect(screen.queryByTestId('pin-gate-forgot-code')).toBeNull();
  });
});

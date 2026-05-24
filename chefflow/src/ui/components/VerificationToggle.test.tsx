import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VerificationToggle from './VerificationToggle';

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('VerificationToggle', () => {
  it('renders the verify button when unverified', () => {
    const onChange = vi.fn();
    render(<VerificationToggle chefName="Alex" onChange={onChange} />);
    expect(screen.getByRole('button', { name: /mark as verified/i })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clicking Verify stamps verifiedAt + verifiedBy via onChange', () => {
    const onChange = vi.fn();
    render(<VerificationToggle chefName="Alex" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /mark as verified/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0][0];
    expect(arg.verifiedAt).toBeGreaterThan(0);
    expect(arg.verifiedBy).toBe('Alex');
  });

  it('aborts when the chef cancels the confirm dialog', () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const onChange = vi.fn();
    render(<VerificationToggle chefName="Alex" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /mark as verified/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the verified chip with name + date when verified', () => {
    const onChange = vi.fn();
    render(
      <VerificationToggle
        chefName="Alex"
        verifiedAt={new Date('2026-05-24T12:00:00Z').getTime()}
        verifiedBy="Jamie"
        onChange={onChange}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/Verified by/);
    expect(status.textContent).toMatch(/Jamie/);
  });

  it('Clear button unsets verifiedAt + verifiedBy', () => {
    const onChange = vi.fn();
    render(
      <VerificationToggle
        chefName="Alex"
        verifiedAt={Date.now()}
        verifiedBy="Jamie"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /clear verification/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual({ verifiedAt: undefined, verifiedBy: undefined });
  });

  it('falls back to "unknown" when chefName is empty', () => {
    const onChange = vi.fn();
    render(<VerificationToggle chefName="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /mark as verified/i }));
    expect(onChange.mock.calls[0][0].verifiedBy).toBe('unknown');
  });
});

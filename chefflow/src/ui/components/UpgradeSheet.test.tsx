import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpgradeSheet from './UpgradeSheet';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

beforeEach(() => {
  useUpgradeSheetStore.setState({ open: false, reason: null });
});

afterEach(() => {
  cleanup();
  useUpgradeSheetStore.setState({ open: false, reason: null });
});

describe('UpgradeSheet', () => {
  it('renders nothing when closed', () => {
    render(<UpgradeSheet />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the recipe headline when opened with reason=recipe', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /daily recipe limit/i })).toBeInTheDocument();
  });

  it('shows event-specific copy when reason=event', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'event' });
    render(<UpgradeSheet />);
    expect(screen.getByRole('heading', { name: /daily event limit/i })).toBeInTheDocument();
  });

  it('shows LLM-specific copy when reason=llm', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'llm' });
    render(<UpgradeSheet />);
    expect(screen.getByRole('heading', { name: /AI calls/i })).toBeInTheDocument();
  });

  it('shows the un-prompted upgrade copy when reason=general (nav Upgrade button)', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'general' });
    render(<UpgradeSheet />);
    expect(screen.getByRole('heading', { name: /choose a plan/i })).toBeInTheDocument();
  });

  it('closes when the X button is clicked', async () => {
    const user = userEvent.setup();
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(useUpgradeSheetStore.getState().open).toBe(false);
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    await user.keyboard('{Escape}');
    expect(useUpgradeSheetStore.getState().open).toBe(false);
  });

  it('shows the £15/mo Pro pricing pulled from TIER_PRICE_GBP', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    // £15 appears in both the Pro card price + monthly CTA — both ok.
    expect(screen.getAllByText(/£15/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Annual: £135\/yr/)).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-sheet-cta-pro-annual')).toHaveTextContent('£135/yr');
  });

  it('shows the £50/mo Enterprise pricing alongside Pro (two-card grid)', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    expect(screen.getAllByText(/£50/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Annual: £450\/yr/)).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-sheet-cta-enterprise-monthly')).toBeInTheDocument();
  });

  it('renders Pro + Enterprise monthly + annual CTAs as enabled', () => {
    useUpgradeSheetStore.setState({ open: true, reason: 'recipe' });
    render(<UpgradeSheet />);
    expect(screen.getByTestId('upgrade-sheet-cta-pro-monthly')).toBeEnabled();
    expect(screen.getByTestId('upgrade-sheet-cta-pro-annual')).toBeEnabled();
    expect(screen.getByTestId('upgrade-sheet-cta-enterprise-monthly')).toBeEnabled();
    expect(screen.getByTestId('upgrade-sheet-cta-enterprise-annual')).toBeEnabled();
  });
});

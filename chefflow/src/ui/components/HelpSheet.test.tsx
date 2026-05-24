import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { clerkMockSignedIn } from '../../test-helpers/clerkMock';

vi.mock('@clerk/clerk-react', () => clerkMockSignedIn('user_help_test'));

import HelpSheet from './HelpSheet';

describe('HelpSheet', () => {
  it('renders nothing when closed', () => {
    render(<HelpSheet open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the textarea and mailto link when open', () => {
    render(<HelpSheet open={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/message to support/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /open email draft/i });
    expect(link).toHaveAttribute('href', expect.stringMatching(/^mailto:support@chefflow\.com\?/));
  });

  it('mailto subject is encoded correctly', () => {
    render(<HelpSheet open={true} onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /open email draft/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('subject=ChefFlow%20%E2%80%94%20help%20%2F%20feedback');
  });

  it('mailto body includes the user-typed message + metadata footer', () => {
    render(<HelpSheet open={true} onClose={() => {}} />);
    const textarea = screen.getByLabelText(/message to support/i);
    fireEvent.change(textarea, { target: { value: 'recipe step ordering looks wrong' } });

    const link = screen.getByRole('link', { name: /open email draft/i });
    const href = decodeURIComponent(link.getAttribute('href') ?? '');
    expect(href).toContain('recipe step ordering looks wrong');
    expect(href).toContain('Version:');
    expect(href).toContain('Route:');
  });

  it('mailto body falls back to a placeholder when textarea is empty', () => {
    render(<HelpSheet open={true} onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /open email draft/i });
    const href = decodeURIComponent(link.getAttribute('href') ?? '');
    expect(href).toContain('describe what you were doing');
  });

  it('Escape key closes the sheet', () => {
    const onClose = vi.fn();
    render(<HelpSheet open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

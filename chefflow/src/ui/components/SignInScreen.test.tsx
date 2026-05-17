import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SignInScreen from './SignInScreen';

vi.mock('@clerk/clerk-react', () => ({
  SignIn: () => <div data-testid="clerk-signin">[Clerk SignIn widget]</div>,
}));

describe('SignInScreen', () => {
  it('renders the ChefFlow heading and tagline', () => {
    render(<SignInScreen />);
    expect(screen.getByRole('heading', { name: /chefflow/i })).toBeInTheDocument();
    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
  });

  it('mounts the Clerk SignIn widget', () => {
    render(<SignInScreen />);
    expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SignInScreen from './SignInScreen';

vi.mock('@clerk/clerk-react', () => ({
  SignIn: () => <div data-testid="clerk-signin">[Clerk SignIn widget]</div>,
  SignUp: () => <div data-testid="clerk-signup">[Clerk SignUp widget]</div>,
}));

describe('SignInScreen', () => {
  it('renders the ChefFlow heading and tagline', () => {
    render(<SignInScreen />);
    expect(screen.getByRole('heading', { name: /chefflow/i })).toBeInTheDocument();
    expect(screen.getAllByText(/sign in/i).length).toBeGreaterThan(0);
  });

  it('mounts the Clerk SignIn widget by default', () => {
    render(<SignInScreen />);
    expect(screen.getByTestId('clerk-signin')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-signup')).not.toBeInTheDocument();
  });

  it('toggles to the Clerk SignUp widget when "Create account" is clicked', () => {
    render(<SignInScreen />);
    fireEvent.click(screen.getByRole('tab', { name: /create account/i }));
    expect(screen.getByTestId('clerk-signup')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-signin')).not.toBeInTheDocument();
  });
});

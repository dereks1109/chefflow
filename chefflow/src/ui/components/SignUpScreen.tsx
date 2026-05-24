import { SignUp } from '@clerk/clerk-react';

export default function SignUpScreen() {
  return (
    <SignUp
      appearance={{
        elements: {
          card: 'shadow-md border border-slate-200 dark:border-slate-700',
          formButtonPrimary: 'bg-accent hover:bg-accent/90',
        },
      }}
    />
  );
}

import { SignIn } from '@clerk/clerk-react';
import BrandLogo from './BrandLogo';

export default function SignInScreen() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12
                 bg-slate-50 dark:bg-kitchen-ink"
    >
      <header className="text-center mb-8">
        <h1 className="inline-flex items-center justify-center text-3xl font-bold text-slate-900 dark:text-slate-100">
          <BrandLogo
            showText
            iconClassName="h-10 w-10 text-accent"
            textClassName="ml-2"
          />
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Sign in to plan recipes, build workflows, and run service.
        </p>
      </header>
      <SignIn
        appearance={{
          elements: {
            card: 'shadow-md border border-slate-200 dark:border-slate-700',
            formButtonPrimary: 'bg-accent hover:bg-accent/90',
          },
        }}
      />
    </main>
  );
}

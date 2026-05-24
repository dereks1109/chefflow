import { useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { ChefHat } from 'lucide-react';
import SignUpScreen from './SignUpScreen';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('sign-in');

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12
                 bg-slate-50 dark:bg-kitchen-ink"
    >
      <header className="text-center mb-6">
        <ChefHat className="h-10 w-10 mx-auto text-accent" aria-hidden="true" />
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
          ChefFlow
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {mode === 'sign-in'
            ? 'Sign in to plan recipes, build workflows, and run service.'
            : 'Create an account to start planning recipes and events.'}
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Authentication mode"
        className="mb-4 inline-flex p-1 rounded-lg bg-slate-200 dark:bg-slate-800"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sign-in'}
          onClick={() => setMode('sign-in')}
          className={[
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            mode === 'sign-in'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
          ].join(' ')}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'sign-up'}
          onClick={() => setMode('sign-up')}
          className={[
            'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
            mode === 'sign-up'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
          ].join(' ')}
        >
          Create account
        </button>
      </div>

      {mode === 'sign-in' ? (
        <SignIn
          appearance={{
            elements: {
              card: 'shadow-md border border-slate-200 dark:border-slate-700',
              formButtonPrimary: 'bg-accent hover:bg-accent/90',
            },
          }}
        />
      ) : (
        <SignUpScreen />
      )}
    </main>
  );
}

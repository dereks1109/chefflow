import { SignIn } from '@clerk/clerk-react';
import { ChefHat } from 'lucide-react';

export default function SignInScreen() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12
                 bg-slate-50 dark:bg-kitchen-ink"
    >
      <header className="text-center mb-8">
        <ChefHat className="h-10 w-10 mx-auto text-accent" aria-hidden="true" />
        <h1 className="mt-3 text-3xl font-bold text-slate-900 dark:text-slate-100">
          ChefFlow
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
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

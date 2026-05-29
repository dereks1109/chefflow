import { useClerk } from '@clerk/clerk-react';
import { Sparkles } from 'lucide-react';

// Persistent banner shown on guest-browseable surfaces (/recipes,
// /events, /community) when there's no signed-in Clerk user. Frames
// the demo content as a preview and gives the chef a direct path to
// sign in. Hides itself for signed-in chefs.
//
// Wire via `useIsGuest` in the parent — this component is a dumb
// renderer; it doesn't gate itself, so the parent can place it
// freely under any conditional.

interface Props {
  /** Short surface-specific copy. Defaults to recipes-flavoured. */
  scope?: 'recipes' | 'events' | 'community';
}

const COPY: Record<NonNullable<Props['scope']>, string> = {
  recipes: "You're browsing demo recipes. Sign in to save, edit, or create your own.",
  events: "You're browsing demo events. Sign in to save, edit, or create your own.",
  community: "Sign in to copy a recipe to your library, leave a like, or publish your own.",
};

export default function GuestBrowseBanner({ scope = 'recipes' }: Props) {
  const clerk = useClerk();
  return (
    <div
      role="note"
      data-testid="guest-browse-banner"
      className="mb-4 flex items-start gap-3 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200"
    >
      <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <p className="flex-1 leading-snug">{COPY[scope]}</p>
      <button
        type="button"
        onClick={() => clerk.openSignIn?.()}
        data-testid="guest-browse-banner-signin"
        className="btn-primary text-xs shrink-0"
      >
        Sign in
      </button>
    </div>
  );
}

import { Users } from 'lucide-react';

// Persistent banner shown at the top of read-only surfaces (a recipe,
// event, or workflow that was shared TO the caller by the owner of an
// Enterprise team they're a viewer of). Mirrors the visual treatment of
// GuestBrowseBanner — small, non-blocking, explanatory — so chefs see
// a consistent "you're looking, not editing" cue across the app.
//
// Owner identity is not surfaced yet (Phase 5 will resolve owner_user_id
// → email via team_memberships); for now the banner just says
// "shared by the team owner".

interface Props {
  /** Surface-specific noun used in the explanatory copy. */
  scope?: 'recipe' | 'event' | 'workflow';
}

const COPY: Record<NonNullable<Props['scope']>, string> = {
  recipe: 'This recipe was shared with you as a team member. View only — edits and sharing are reserved for the owner.',
  event: 'This event was shared with you as a team member. View only — edits and sharing are reserved for the owner.',
  workflow: 'This workflow was shared with you as a team member. View only — only the owner can save changes or regenerate.',
};

export default function SharedReadOnlyBanner({ scope = 'recipe' }: Props) {
  return (
    <div
      role="note"
      data-testid="shared-readonly-banner"
      className="mb-4 flex items-start gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200"
    >
      <Users className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-snug">{COPY[scope]}</p>
    </div>
  );
}

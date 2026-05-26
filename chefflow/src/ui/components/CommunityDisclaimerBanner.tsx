import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

// Persistent disclaimer banner shown wherever a non-author chef sees
// community-authored content. The legal goal is the same as the
// publish-time AllergenAttestationModal but on the receiving side:
// remind the viewing chef that the displayed recipe was author-declared,
// not verified by ChefFlow, and that they remain the food business
// operator responsible for any plating decisions made off the back of
// what they read here.
//
// Two presentations:
//   variant="full"    — multi-line, used at the top of CommunityRecipeView.
//   variant="compact" — one-line, used above the card grid on CommunityLibrary.

interface Props {
  variant?: 'full' | 'compact';
}

export default function CommunityDisclaimerBanner({ variant = 'full' }: Props) {
  if (variant === 'compact') {
    return (
      <div
        role="note"
        data-testid="community-disclaimer-compact"
        className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
      >
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Community recipes are author-declared and not verified by ChefFlow.
          Always check allergens against your own supplier labels before serving.{' '}
          <Link to="/disclaimer" className="underline hover:text-amber-700">
            See Disclaimer
          </Link>
          .
        </span>
      </div>
    );
  }
  return (
    <div
      role="note"
      data-testid="community-disclaimer-full"
      className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="leading-snug">
        Community recipes are author-declared and not verified by ChefFlow.
        Allergens, ingredients, and quantities must be checked against your
        own supplier labels before serving — you remain the food business
        operator under the Food Information Regulations 2014.{' '}
        <Link to="/disclaimer" className="underline hover:text-amber-700">
          See Disclaimer
        </Link>
        .
      </p>
    </div>
  );
}

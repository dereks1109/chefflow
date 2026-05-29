import { useEffect, useLayoutEffect, useState } from 'react';
import { ChefHat, X } from 'lucide-react';
import { useTourState, TOTAL_STEPS } from '../../state/useTourState';

// ProductTour — 4-step post-onboarding spotlight that introduces the
// chef to the Recipes → Events → Workflows → Community triad.
//
// Each step:
//   - Highlights a target nav element using its data-testid.
//   - Renders a popover card next to it with title + body + Next/Skip.
//   - Final "Got it" step closes the tour + sets the localStorage flag
//     so it never fires again on this device.
//
// Responsive: looks up the same testid (e.g. `nav-recipes`) regardless
// of viewport — both TopNav and BottomNav apply the same testid, and
// only one is visible at a given width, so the spotlight lands on the
// right element either way.
//
// Wired into App.tsx at the root; OnboardingSheet calls
// useTourState.getState().start() on first-time `onDone`.

interface TourStep {
  testid: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    testid: 'nav-recipes',
    title: 'Your recipe library',
    body: 'Demo recipes are already seeded here. Click any card to see how a recipe looks in ChefFlow.',
  },
  {
    testid: 'nav-events',
    title: 'Plan an event',
    body: 'Combine recipes into a service — birthday dinner, supper club, catering job. The Demo Event shows the shape.',
  },
  {
    testid: 'nav-workflows',
    title: 'Auto-scheduled workflows',
    body: 'Open any event → Generate Workflow. The AI turns your dishes into a kitchen prep timeline you can print to PDF.',
  },
  {
    testid: 'nav-community',
    title: 'Discover + share',
    body: 'Browse recipes other chefs have published. Publish your own when you’re ready.',
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readTargetRect(testid: string): TargetRect | null {
  if (typeof document === 'undefined') return null;
  // Prefer the visible nav (TopNav OR BottomNav) — both tag links with
  // the same testid, but only one is visible at any given viewport
  // width (CSS hidden on the other). querySelectorAll + isVisible
  // check picks the right one.
  const matches = document.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`);
  for (const el of Array.from(matches)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
    }
  }
  return null;
}

export default function ProductTour() {
  const { active, step, next, dismissForever } = useTourState();
  const [rect, setRect] = useState<TargetRect | null>(null);

  // Re-measure on window resize and on each step change. useLayoutEffect
  // so the popover paints in the right place on the first frame after
  // a step change (no flicker).
  useLayoutEffect(() => {
    if (!active) return;
    if (step >= TOTAL_STEPS) { setRect(null); return; }
    function measure() {
      const target = STEPS[step]?.testid;
      if (!target) { setRect(null); return; }
      setRect(readTargetRect(target));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, step]);

  // ESC dismisses; matches every other modal in the app.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismissForever();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, dismissForever]);

  if (!active) return null;

  // Final "Got it" card — no spotlight, centred on screen.
  if (step >= TOTAL_STEPS) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-tour-final-title"
        data-testid="product-tour-final"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      >
        <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <ChefHat className="h-5 w-5 text-accent mt-0.5 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <h2 id="product-tour-final-title" className="text-base font-semibold">You’re set.</h2>
              <p className="mt-1 text-sm text-slate-500">
                Open Settings any time to manage your plan + restore demo content if you ever delete a recipe.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={next}
            data-testid="product-tour-finish"
            className="mt-4 btn-primary w-full text-sm"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  const { title, body } = STEPS[step];
  return (
    <>
      {/* Spotlight overlay — full-screen dark backdrop with a "hole"
          carved around the target using a giant inverse box-shadow.
          When rect is unavailable (target not in DOM yet), fall back to
          a plain backdrop so the popover still shows. */}
      <div
        aria-hidden="true"
        data-testid="product-tour-spotlight"
        className="fixed inset-0 z-40 pointer-events-none transition-all duration-200"
        style={
          rect
            ? {
                top: rect.top - 6,
                left: rect.left - 6,
                width: rect.width + 12,
                height: rect.height + 12,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                borderRadius: 8,
              }
            : { boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.6)' }
        }
      />

      {/* Popover card — pinned near the target. Falls back to bottom-
          center when the target rect is unavailable (defensive). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`product-tour-step-${step}-title`}
        data-testid={`product-tour-step-${step}`}
        className="fixed z-50 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-1 p-4 shadow-2xl"
        style={popoverPositionFor(rect)}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id={`product-tour-step-${step}-title`} className="text-sm font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={dismissForever}
            aria-label="Skip tour"
            data-testid="product-tour-skip"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 p-1 -m-1 rounded"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-snug">{body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500">
            {step + 1} of {TOTAL_STEPS}
          </span>
          <button
            type="button"
            onClick={next}
            data-testid="product-tour-next"
            className="btn-primary text-xs"
          >
            {step + 1 === TOTAL_STEPS ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}

/** Pick where to place the popover relative to the target. Prefers
 *  below the target; flips above when there isn't enough room (e.g.
 *  the BottomNav target is at the bottom of the screen). */
function popoverPositionFor(rect: TargetRect | null): React.CSSProperties {
  if (!rect || typeof window === 'undefined') {
    // Defensive fallback: bottom-centre.
    return { bottom: 32, left: '50%', transform: 'translateX(-50%)' };
  }
  const POPOVER_W = 288; // ~ w-72
  const POPOVER_H = 160; // approximate
  const GAP = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const placeBelow = rect.top + rect.height + GAP + POPOVER_H < vh;
  const top = placeBelow ? rect.top + rect.height + GAP : Math.max(8, rect.top - GAP - POPOVER_H);
  // Centre on the target horizontally; clamp to viewport.
  let left = rect.left + rect.width / 2 - POPOVER_W / 2;
  left = Math.max(8, Math.min(vw - POPOVER_W - 8, left));
  return { top, left };
}

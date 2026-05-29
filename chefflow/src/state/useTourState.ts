import { create } from 'zustand';

// useTourState — orchestrates the 4-step post-onboarding product tour.
//
// Shipped 2026-05-29 from the UX audit. Chef closes the OnboardingSheet
// for the first time → tour starts → spotlights the four primary nav
// destinations in order → chef dismisses or steps through to the end.
// Once dismissed (Skip OR finish), the localStorage flag prevents the
// tour from ever re-firing on this device.
//
// Tour content is wired in ProductTour.tsx; this store only owns the
// active / step / dismissed-forever bookkeeping.

const STORAGE_KEY = 'chefflow:tour-dismissed-v1';

function hasBeenDismissed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // localStorage can throw in incognito/private modes — treat as "dismissed"
    // so we never block first paint on a permissions error.
    return true;
  }
}

function markDismissed(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Same as above — swallow.
  }
}

/** Total step count (0-indexed). When `step === TOTAL_STEPS` the tour
 *  is on its final "all done" card and the next click dismisses. */
export const TOTAL_STEPS = 4;

interface TourState {
  active: boolean;
  /** 0-indexed step pointer. 0..TOTAL_STEPS-1 = active steps,
   *  TOTAL_STEPS = "Got it" final card. */
  step: number;
  start: () => void;
  next: () => void;
  dismissForever: () => void;
}

export const useTourState = create<TourState>((set, get) => ({
  active: false,
  step: 0,

  start: () => {
    if (hasBeenDismissed()) return;
    set({ active: true, step: 0 });
  },

  next: () => {
    const { step } = get();
    if (step >= TOTAL_STEPS) {
      // Final card → dismiss.
      markDismissed();
      set({ active: false, step: 0 });
      return;
    }
    set({ step: step + 1 });
  },

  dismissForever: () => {
    markDismissed();
    set({ active: false, step: 0 });
  },
}));

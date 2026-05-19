import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// UK PECR / UK GDPR consent state. Today nothing non-essential is loaded, so
// `analytics` and `preferences` gate nothing — but the store is wired so a
// future analytics integration can call `hasAnalyticsConsent()` before
// initialising and the banner UX doesn't need to change.
//
// Storage key intentionally suffixed `-v1`. Increment to `-v2` whenever a
// category is added or renamed; persisted state under the old key will be
// ignored and returning users will see the banner again.

export type ConsentStatus = 'undecided' | 'granted' | 'denied' | 'custom';

export interface ConsentCategories {
  /** Always true. Includes Clerk session cookies + functional first-party storage. */
  necessary: true;
  analytics: boolean;
  /** Theme + unit-system + other functional remembered choices. */
  preferences: boolean;
}

export interface ConsentState {
  status: ConsentStatus;
  categories: ConsentCategories;
  /** ISO 8601 when the user last made an explicit choice. Null until then. */
  decidedAt: string | null;
  /** Transient — true means the banner is visible regardless of `status`. */
  bannerOpen: boolean;
  acceptAll: () => void;
  rejectNonEssential: () => void;
  setCategories: (partial: Partial<Omit<ConsentCategories, 'necessary'>>) => void;
  reopen: () => void;
  closeBanner: () => void;
}

const INITIAL_CATEGORIES: ConsentCategories = {
  necessary: true,
  analytics: false,
  preferences: false,
};

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      status: 'undecided',
      categories: INITIAL_CATEGORIES,
      decidedAt: null,
      bannerOpen: false,
      acceptAll: () =>
        set({
          status: 'granted',
          categories: { necessary: true, analytics: true, preferences: true },
          decidedAt: new Date().toISOString(),
          bannerOpen: false,
        }),
      rejectNonEssential: () =>
        set({
          status: 'denied',
          categories: INITIAL_CATEGORIES,
          decidedAt: new Date().toISOString(),
          bannerOpen: false,
        }),
      setCategories: (partial) =>
        set((state) => ({
          status: 'custom',
          categories: { ...state.categories, ...partial, necessary: true },
          decidedAt: new Date().toISOString(),
          bannerOpen: false,
        })),
      reopen: () => set({ bannerOpen: true }),
      closeBanner: () => set({ bannerOpen: false }),
    }),
    {
      name: 'chefflow:cookie-consent-v1',
      // Don't persist the transient `bannerOpen` flag.
      partialize: (s) => ({ status: s.status, categories: s.categories, decidedAt: s.decidedAt }),
    },
  ),
);

export function isBannerVisible(state: ConsentState): boolean {
  return state.bannerOpen || state.status === 'undecided';
}

export function hasAnalyticsConsent(): boolean {
  return useConsentStore.getState().categories.analytics;
}

export function hasPreferencesConsent(): boolean {
  return useConsentStore.getState().categories.preferences;
}

/** Imperative trigger — usable outside React (e.g. from a footer link handler). */
export function reopenConsentBanner(): void {
  useConsentStore.getState().reopen();
}

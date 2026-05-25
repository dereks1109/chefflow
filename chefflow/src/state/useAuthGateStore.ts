import { create } from 'zustand';

// Tiny store holding a single pending action — set when a signed-out user
// clicks a gated button, fired by AuthGateRunner once Clerk reports they're
// signed in. Public-by-default app model: every page is browseable, but
// write actions queue here and the sign-in modal pops on top.
interface AuthGateState {
  pendingAction: (() => void) | null;
  setPendingAction: (action: (() => void) | null) => void;
  clearPendingAction: () => void;
}

export const useAuthGateStore = create<AuthGateState>((set) => ({
  pendingAction: null,
  setPendingAction: (action) => set({ pendingAction: action }),
  clearPendingAction: () => set({ pendingAction: null }),
}));

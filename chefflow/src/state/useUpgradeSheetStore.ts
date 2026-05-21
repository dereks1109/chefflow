import { create } from 'zustand';
import type { QuotaKind } from '../core/tier/quotaClient';

// Tiny global store so any call site (RecipesLibrary, EventsLibrary,
// proxyClient catch blocks, the nav Upgrade button…) can open the
// UpgradeSheet without prop drilling. Mounted once at AppLayout level.

/** `'general'` is the un-prompted nav Upgrade button — chef hasn't hit a cap. */
export type UpgradeReason = QuotaKind | 'general';

interface UpgradeSheetState {
  open: boolean;
  reason: UpgradeReason | null;
  openWith: (reason: UpgradeReason) => void;
  close: () => void;
}

export const useUpgradeSheetStore = create<UpgradeSheetState>((set) => ({
  open: false,
  reason: null,
  openWith: (reason) => set({ open: true, reason }),
  close: () => set({ open: false, reason: null }),
}));

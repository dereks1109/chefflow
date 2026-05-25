import { create } from 'zustand';

// Reflects Clerk publicMetadata.role === 'admin'. Hydrated by <TierSync />
// alongside the tier. Default false; the admin nav link + /admin route both
// read this flag.
interface AdminState {
  isAdmin: boolean;
  setIsAdmin: (next: boolean) => void;
}

export const useAdminStore = create<AdminState>((set) => ({
  isAdmin: false,
  setIsAdmin: (next) => set({ isAdmin: next }),
}));

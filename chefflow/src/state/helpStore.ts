import { create } from 'zustand';

interface HelpState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

import { create } from 'zustand';

interface AccountSetupState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useAccountSetupStore = create<AccountSetupState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

import { create } from 'zustand';

interface AccountDataState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useAccountDataStore = create<AccountDataState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

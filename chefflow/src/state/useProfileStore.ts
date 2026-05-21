import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProfileState {
  displayName: string;
  avatarDataUrl: string | null;
  setDisplayName: (next: string) => void;
  setAvatarDataUrl: (next: string | null) => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      displayName: '',
      avatarDataUrl: null,
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarDataUrl: (avatarDataUrl) => set({ avatarDataUrl }),
      clear: () => set({ displayName: '', avatarDataUrl: null }),
    }),
    { name: 'chefflow:profile:v1' },
  ),
);

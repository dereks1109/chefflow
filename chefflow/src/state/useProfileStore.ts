import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProfileState {
  displayName: string;
  avatarDataUrl: string | null;
  /** When true, the chef's displayName is forwarded to the worker on
   *  publish; when false, the worker sees an empty name and stamps the
   *  recipe with "Anonymous chef". Default false — opt-in to publish under
   *  your real name. */
  showNameOnCommunity: boolean;
  setDisplayName: (next: string) => void;
  setAvatarDataUrl: (next: string | null) => void;
  setShowNameOnCommunity: (next: boolean) => void;
  clear: () => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      displayName: '',
      avatarDataUrl: null,
      showNameOnCommunity: false,
      setDisplayName: (displayName) => set({ displayName }),
      setAvatarDataUrl: (avatarDataUrl) => set({ avatarDataUrl }),
      setShowNameOnCommunity: (showNameOnCommunity) => set({ showNameOnCommunity }),
      clear: () => set({ displayName: '', avatarDataUrl: null, showNameOnCommunity: false }),
    }),
    { name: 'chefflow:profile:v1' },
  ),
);

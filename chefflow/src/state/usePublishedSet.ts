import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Map local recipe id → community id. Lets the editor render Publish vs.
// Unpublish without a round-trip to the worker on every mount.
export interface PublishedSetState {
  map: Record<string, string>;
  link: (localId: string, communityId: string) => void;
  unlink: (localId: string) => void;
  getCommunityId: (localId: string) => string | undefined;
}

export const usePublishedSet = create<PublishedSetState>()(
  persist(
    (set, get) => ({
      map: {},
      link: (localId, communityId) =>
        set((s) => ({ map: { ...s.map, [localId]: communityId } })),
      unlink: (localId) =>
        set((s) => {
          const next = { ...s.map };
          delete next[localId];
          return { map: next };
        }),
      getCommunityId: (localId) => get().map[localId],
    }),
    { name: 'chefflow:published:v1' },
  ),
);

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isDefaultAllergyKeyword } from '../core/events/allergyKeywords';

// Chef-supplied extensions to the default allergy keyword list (see
// `core/events/allergyKeywords.ts`). The default list is the safety
// baseline and is NEVER editable from the UI — the store holds only the
// chef's ADDITIONS. Trying to add a default-list keyword is a silent
// no-op (de-duped by the matcher anyway).
//
// Persistence: localStorage under `chefflow:allergy-keyword-extras`. Not
// synced to D1 today — these are per-device chef preferences; cross-
// device sync can be added later if asked. (Same pattern as
// `unitSystemStore`.)

interface AllergyKeywordsState {
  extras: string[];
  add: (raw: string) => void;
  remove: (word: string) => void;
  clear: () => void;
}

function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

export const useAllergyKeywordsStore = create<AllergyKeywordsState>()(
  persist(
    (set, get) => ({
      extras: [],
      add: (raw) => {
        const word = normalise(raw);
        if (!word) return;
        if (isDefaultAllergyKeyword(word)) return;
        const { extras } = get();
        if (extras.includes(word)) return;
        set({ extras: [...extras, word] });
      },
      remove: (word) => {
        const norm = normalise(word);
        set({ extras: get().extras.filter((w) => w !== norm) });
      },
      clear: () => set({ extras: [] }),
    }),
    {
      name: 'chefflow:allergy-keyword-extras',
      version: 1,
    },
  ),
);

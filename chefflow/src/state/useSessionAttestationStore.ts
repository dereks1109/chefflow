// Session-scoped attestation store. NOT persisted — refreshing the page or
// signing out re-prompts the chef on the next save, which is the desired
// behaviour (we want a fresh acknowledgement per work session, not a
// once-forever click).
//
// Currently tracks whether the chef has acknowledged the "ChefFlow is not
// a hygiene-certification service" framing during this browser session.
// Set true by `RecipeSaveAttestationModal` Confirm; read by the
// `RecipeEditor.handleSave()` guard to decide whether to open the modal
// or save directly.

import { create } from 'zustand';

interface SessionAttestationState {
  recipeSaveAttested: boolean;
  setRecipeSaveAttested(v: boolean): void;
}

export const useSessionAttestationStore = create<SessionAttestationState>((set) => ({
  recipeSaveAttested: false,
  setRecipeSaveAttested: (v) => set({ recipeSaveAttested: v }),
}));

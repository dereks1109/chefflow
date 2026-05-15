import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Default model — Groq's flagship for instruction following + JSON mode.
// Swappable later via a model-picker UI, but locked for v1.
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

export interface LlmSettings {
  apiKey: string;
  model: string;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  clear: () => void;
  /** Convenience: true when an API key is present. */
  isReady: () => boolean;
}

export const useLlmSettingsStore = create<LlmSettings>()(
  persist(
    (set, get) => ({
      apiKey: '',
      model: DEFAULT_GROQ_MODEL,
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      clear: () => set({ apiKey: '', model: DEFAULT_GROQ_MODEL }),
      isReady: () => get().apiKey.trim().length > 0,
    }),
    { name: 'chefflow:llm-settings' },
  ),
);

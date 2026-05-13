import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UnitSystem } from '../core/types';

interface UnitSystemState {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
}

export const useUnitSystemStore = create<UnitSystemState>()(
  persist(
    (set) => ({
      system: 'auto',
      setSystem: (system) => set({ system }),
    }),
    {
      name: 'chefflow:unit-system',
    }
  )
);

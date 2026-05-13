export type UnitSystem = 'metric' | 'imperial' | 'auto';

export type ThermalClass = 'flash' | 'stable' | 'normal';
export type AllergenClass = 'allergen-free' | 'allergen';
export type StepKind = 'active' | 'passive';
export type StepPhase = 'prep' | 'cook' | 'serve';
export type SchedulePhase = StepPhase | 'sanitize';

export interface Ingredient {
  id: string;
  raw: string;          // e.g. "{800|g|Beef Chuck}"
  amount: number;
  unit: string;
  name: string;
  isLocked: boolean;
}

export interface WorkflowStep {
  id: string;
  text: string;         // markdown body (may include <Timer …>)
  durationSec?: number;
  kind: StepKind;
  equipment?: string[];
  thermalClass: ThermalClass;
  allergenClass: AllergenClass;
  dependsOn: string[];
  batchKey?: string;
  panCapacityPortions?: number;
  phase: StepPhase;
}

export interface Recipe {
  id: string;
  title: string;
  originalYield: number;
  prepTime?: string;
  cookTime?: string;
  ingredients: Ingredient[];
  steps: WorkflowStep[];
  createdAt: number;
  updatedAt: number;
}

export interface EventDish {
  recipeId: string;
  recipeSnapshot: Recipe;
  portions: number;
  perDishNotes?: string;
}

export interface KitchenEvent {
  id: string;
  title: string;
  serveAt?: string;     // ISO datetime
  notes: string;
  dishes: EventDish[];
  createdAt: number;
  updatedAt: number;
}

export interface ScheduledStep {
  stepId: string;
  recipeId: string;
  dishLabel: string;
  text: string;
  durationSec?: number;
  startAt: Date;
  endAt: Date;
  phase: SchedulePhase;
  dependsOnStepIds: string[];
  warnings: string[];
}

# DESIGN.md - ChefFlow Technical & Product Design

## 1. Data Schema: The "Chef-Markdown" Standard
To enable automatic scaling and unit conversion, the app parses Markdown into a structured JSON object.

### Ingredient Object
```typescript
interface Ingredient {
  raw: string;        // Original markdown format, e.g., "{500|g|flour}"
  amount: number;     // Numeric amount, e.g., 500
  unit: string;       // Unit of measurement, e.g., "g"
  name: string;       // Ingredient name, e.g., "flour"
  isLocked: boolean;  // If true, scaling won't affect this (e.g., spices)
}
```

### Workflow Node
A step within a recipe's cooking sequence:
- **Step**: Text-based instruction.
- **Trigger**: Timers `<Timer>` or Temperature alerts.
- **Dependency**: Does this step require previous steps to finish?

---

## 2. Unit Conversion Engine (Logic Flow)
The conversion follows a **Source -> Base -> Target** pipeline to maintain precision.

1. **Capture**: Detect `{amount|unit|name}` pattern in markdown.
2. **Scale**: Multiply numeric `amount` by `(TargetPortion / OriginalPortion)`.
3. **Normalize**: 
   - If `unitSystem === 'metric'` and `amount >= 1000`, convert to next larger unit (e.g., `1000g` → `1kg`).
   - If `unitSystem === 'imperial'` and `amount >= 16`, convert to next larger unit (e.g., `16oz` → `1lb`).
4. **Display**: Render formatted string (e.g., "1.2 kg Flour").

---

## 3. Scheduling & Workflow Algorithm
How the app arranges the chef's day:

### The "Parallel Cooking" Logic
When a chef adds 3 recipes to a schedule:
- **Gap Analysis**: Find "passive time" (e.g., simmering for 45 mins).
- **Interleaving**: Insert "active tasks" from other recipes into passive gaps.
- **Conflict Warning**: Alert if two tasks require the same equipment (e.g., both need the oven at different temperatures).

---

## 4. User Interface (UX) Architecture

### Kitchen Mode (Active Cooking View)
- **High-Contrast Cards**: Each step displayed as a large, readable card.
- **Voice Feedback**: Text-to-speech for the current step.
- **Global Timers Dashboard**: A sticky bar showing all active countdowns across different recipes.

### Management Mode (Offline/Planning View)
- **Inventory Sync**: Scaling a recipe exports a "Grocery List".
- **Calendar Integration**: Drag-and-drop recipes onto a weekly timeline.

---

## 5. Implementation Roadmap (Technical Milestones)
1. **Parser MVP**: A function that regex-matches ingredients and computes scaled quantities.
2. **The "Unit Hook"**: A React Hook `useSmartUnit(val, unit)` that responds to global unit system changes.
3. **PWA Offline Sync**: Service Workers cache recipes for operation in no-wifi kitchens.

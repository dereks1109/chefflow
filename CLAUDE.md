# CLAUDE.md - ChefFlow Project Specifications

## 📖 Project Overview
CLAUDE (ChefFlow) is a mobile-first web application designed for professional chefs to manage kitchen operations. It transforms static recipes 
## 🛠 Technology Stack
- **Frontend**: React (Next.js / Vite) with Tailwind CSS.
- **State Management**: Zustand (for global unit and portion states).
- **Markdown Engine**: `react-markdown` with custom components for timers and ingredients.
- **Unit Logic**: `convert-units` or `mathjs` for physical quantity calculations.
- **Persistence**: IndexedDB (via Dexie.js) for offline kitchen use.

## 🎨 UI/UX Principles
- **High Contrast**: Optimized for harsh kitchen lighting (True Black #000000 support).
- **Kitchen-Ready**: Large touch targets (min 44x44px) and Web Wake Lock API to keep the screen on.
- **Mobile-First**: Primary focus on single-hand operation during active cooking.

## ⚖️ Unit System
### 1. Global Unit System Toggle
- **Options**: `Metric` (g, kg, L), `Imperial` (oz, lb, gal), or `Auto` (Original Recipe).
- **Real-time Conversion**: Switching systems triggers immediate conversion of all measurements (e.g., 1kg ↔ 2.2lb).
- **Normalization**: 
  - Weight: Auto-upgrade `1000g` to `1kg`.
  - Volume: Auto-upgrade `1000ml` to `1L`.

### 2. Dynamic Portion Scaling
- **Linear Scaling**: Users can adjust the "Yield/Portion" count (e.g., 4pax to 50pax).
- **Scaling Syntax**: Ingredients must be tagged as `{amount|unit|name}` for the parser to identify and multiply values.
- **Lock Feature**: Allow chefs to "Lock" specific ingredients (like salt or spices) to prevent over-scaling.

### 3. Conversion Library
- **Weight**: g, kg, oz, lb.
- **Volume**: ml, L, tsp, tbsp, cup, fl oz, pt, qt, gal.
- **Temperature**: Automatic conversion between Celsius (°C) and Fahrenheit (°F) for both ingredient and cooking temperatures.

## 📝 Markdown & Data Structure
Recipes are stored in Markdown with a structured header (Front Matter):
```markdown
---
recipe_id: "beef-stew-001"
original_yield: 4
prep_time: 30m
cook_time: 2h
---
# Red Wine Beef Stew
## Ingredients
- [ ] {800|g|Beef Chuck}
- [ ] {2|tbsp|Tomato Paste}
## Workflow
1. <Timer duration="600s">Sear the beef</Timer> until browned.
2. Deglaze the pan with wine.
```

## ⌨️ Development Commands
- `npm run dev`: Start development server.
- `npm run build`: Build for production (PWA).
- `npm run lint`: Run ESLint checks.

## 🕵️ Coding Standards
- **Precision**: Use `Decimal.js` for financial/critical unit math to avoid floating-point errors.
- **Parser**: Keep conversion logic in a dedicated unit engine module separate from UI components.
- **Accessibility**: Ensure all timers have audible alerts (Web Audio API) for noisy environments.

## 🎯 Current Focus
1. Implement the **Unit Conversion Engine** with Metric/Imperial toggles.
2. Develop the **Portion Scaler** that updates the ingredient list dynamically.
3. Build the **Workflow Scheduler** that merges multiple recipe workflows into a coordinated kitchen schedule.

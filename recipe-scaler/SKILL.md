---
name: recipe-scaler
description: Scale recipes for different serving sizes and convert between metric/imperial units. Use when user wants to adjust portions, convert measurements, or resize ingredients. Supports portion scaling (4→50 servings), unit conversion (g↔oz, cups↔ml), and locked ingredients.
---

# Recipe Scaler

Help chefs scale recipes for different serving sizes and convert between unit systems.

## Quick Start

**User provides a recipe:**
```
I have a beef stew for 4 people. Scale it to 12. Use metric units.
```

**You:**
1. Extract ingredients and amounts
2. Calculate scaling ratio (12÷4 = 3x)
3. Convert to metric if needed
4. Display scaled recipe

---

## Workflow

### Step 1: Parse Recipe
Extract ingredients in `{amount|unit|name}` format:
```markdown
- [ ] {800|g|Beef Chuck}
- [ ] {2|tbsp|Tomato Paste}
- [ ] {1|tsp|Salt} (LOCKED)
```

Ask: "What's the current serving size?" (e.g., 4 people, 8 servings)

### Step 2: Confirm Scaling
Ask: "How many servings do you need?"

Calculate ratio: `NewServings ÷ OriginalServings`

### Step 3: Choose Unit System
Options:
- **Metric** (g, kg, ml, L)
- **Imperial** (oz, lb, cup, tbsp, tsp)
- **Auto** (keep original units)

### Step 4: Scale Ingredients
For each ingredient:
1. If marked `(LOCKED)`, skip scaling
2. Otherwise, multiply amount by ratio
3. Convert to target unit system if needed
4. Normalize: `1000g → 1kg`, `1000ml → 1L`

### Step 5: Output Scaled Recipe
Display as markdown with:
- Scaled ingredients
- Original serving size → New serving size
- Locked ingredient notes
- Temperature (converted if needed)

---

## Unit Conversion Reference

### Weight (to grams)
- 1 kg = 1000 g
- 1 oz = 28.35 g
- 1 lb = 453.6 g

### Volume (to milliliters)
- 1 L = 1000 ml
- 1 cup = 237 ml
- 1 tbsp = 15 ml
- 1 tsp = 5 ml
- 1 fl oz = 30 ml

### Temperature
- °F to °C: (°F - 32) × 5/9
- °C to °F: (°C × 9/5) + 32

---

## Rounding Rules

| Amount | Rule |
|--------|------|
| > 100 units | Round to nearest 0.5 (e.g., 1237g → 1250g) |
| 10-100 units | Round to nearest 0.1 (e.g., 47 ml → 47 ml) |
| < 10 units | Round to nearest 0.25 (e.g., 1.2 tsp → 1.25 tsp) |
| Whole numbers | Keep exact (5g, 3 tbsp) |

---

## Special Cases

### Locked Ingredients
Some items don't scale proportionally:
```markdown
- [ ] {1|tsp|Salt} (LOCKED)
- [ ] {1|tbsp|Baking Powder} (LOCKED)
```

✓ Preserve these at original amounts
✓ Note in output: "Not scaled — flavor balance"

### Non-Linear Items
If scaling seems extreme, ask:
- "Salt would be 25 tsp (5x). Should I reduce it?"
- "Baking powder would be 6 tbsp (4x). Too much?"

Suggest: Lock it, scale at 50%, or use custom amount.

### Missing Serving Size
If recipe doesn't state servings:
- Ask: "How many servings does this make?"
- Suggest typical: "Apple pie = 8 servings?"

### Temperature Only
If scaling recipe has `180°C` or `350°F`, just convert, don't scale.

---

## Examples

### Example 1: Simple Scale-Up
**Input:**
```
Recipe serves 4:
- {800|g|Beef}
- {2|tbsp|Tomato Paste}
- {250|ml|Red Wine}
Scale to 12, metric units.
```

**Output:**
```
Serves 12 (3x):
- {2.4|kg|Beef}
- {6|tbsp|Tomato Paste}
- {750|ml|Red Wine}
```

### Example 2: Locked Ingredient
**Input:**
```
Scale from 4 to 8 servings:
- {500|g|Flour}
- {1|tsp|Salt} (LOCKED)
```

**Output:**
```
Serves 8:
- {1000|g|Flour}
- {1|tsp|Salt} (unchanged, locked)
```

### Example 3: Unit Conversion
**Input:**
```
Convert to metric, keep 4 servings:
- {2|cup|Flour}
- {1|tbsp|Butter}
- {1|tsp|Vanilla}
```

**Output:**
```
Serves 4 (metric):
- {250|g|Flour}
- {15|g|Butter}
- {5|ml|Vanilla}
```

---

## Anti-Patterns

❌ Don't scale locked ingredients  
❌ Don't blindly scale leavening agents (baking powder, yeast)  
❌ Don't confuse volume (ml, cups) with weight (g, oz)  
❌ Don't forget to ask current serving size  
❌ Don't present 1.2ml as-is; round sensibly (1ml or 1.25ml)  
❌ Don't convert temperature by scaling (it doesn't scale)

---

## Verification Checklist

Before outputting:
- [ ] All ingredients parsed correctly
- [ ] Scaling ratio calculated (no division by zero)
- [ ] Locked ingredients preserved
- [ ] Units converted if needed
- [ ] Normalization applied (1000g → 1kg)
- [ ] Rounding applied sensibly
- [ ] Output is markdown, copy-paste friendly
- [ ] Temperature converted but not scaled

---

## When to Use This Skill

✓ "Scale this for 20 people"  
✓ "Convert cups to grams"  
✓ "Double the recipe"  
✓ "What's this in metric?"  
✓ "I need 50 servings, not 4"  

---

## Tips

1. **Ask before assuming** — Clarify current servings and target
2. **Flag edge cases** — "Salt would be 5 tsp; should we lock it?"
3. **Show the math** — "(800 × 3) = 2400g" for verification
4. **Preserve modifiers** — Keep "thinly sliced", "diced fine" in names
5. **Copy-paste friendly** — Output valid markdown ingredients

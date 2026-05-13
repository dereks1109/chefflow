# Recipe Scaler Examples

Practical examples showing real-world usage.

---

## Example 1: Basic Scale-Up (Restaurant)

**User:** "I have a beef stew recipe that serves 4. I need it for a catering event with 20 people."

**Input Recipe:**
```markdown
# Red Wine Beef Stew (serves 4)

## Ingredients
- [ ] {800|g|Beef Chuck}
- [ ] {2|tbsp|Tomato Paste}
- [ ] {1|tsp|Salt}
- [ ] {250|ml|Red Wine}
- [ ] {500|ml|Beef Broth}
```

**Your Process:**
1. Current servings: 4
2. Target servings: 20
3. Scaling ratio: 20 ÷ 4 = 5x
4. Unit system: Metric (keep as-is)

**Output:**
```markdown
# Red Wine Beef Stew (serves 20)

Scaling ratio: 5x (4 → 20 servings)

## Ingredients
- [ ] {4000|g|Beef Chuck} → {4|kg|Beef Chuck}
- [ ] {10|tbsp|Tomato Paste}
- [ ] {5|tsp|Salt}
- [ ] {1250|ml|Red Wine}
- [ ] {2500|ml|Beef Broth}

**Note:** Normalization applied (4000g → 4kg for readability)
```

---

## Example 2: Unit Conversion (No Scaling)

**User:** "Convert this recipe to metric. Keep it for 4 servings."

**Input:**
```markdown
# Chocolate Chip Cookies (makes 24 cookies)

## Ingredients
- [ ] {2.25|cup|Flour}
- [ ] {1|cup|Butter}
- [ ] {0.75|cup|Sugar}
- [ ] {2|tbsp|Vanilla Extract}
```

**Your Process:**
1. Scaling ratio: 1x (no scaling)
2. Convert cups → grams
   - Flour: 2.25 cup × 125 g/cup = 281 g
   - Butter: 1 cup × 230 g/cup = 230 g
   - Sugar: 0.75 cup × 200 g/cup = 150 g
   - Vanilla: 2 tbsp × 15 ml/tbsp = 30 ml

**Output:**
```markdown
# Chocolate Chip Cookies (metric, makes 24)

Conversion only (no scaling)

## Ingredients
- [ ] {281|g|Flour}
- [ ] {230|g|Butter}
- [ ] {150|g|Sugar}
- [ ] {30|ml|Vanilla Extract}
```

---

## Example 3: Locked Ingredients

**User:** "Scale this spice blend 5x, but lock the chili powder."

**Input:**
```markdown
# Taco Seasoning (small batch)

- [ ] {20|g|Cumin}
- [ ] {15|g|Coriander}
- [ ] {5|tsp|Chili Powder} (LOCKED)
- [ ] {2|tbsp|Garlic Powder}
```

**Your Process:**
1. Scaling ratio: 5x
2. Preserve locked ingredient
3. Scale others

**Output:**
```markdown
# Taco Seasoning (5x batch)

Scaling: 5x | Locked: Chili Powder

## Ingredients
- [ ] {100|g|Cumin}
- [ ] {75|g|Coriander}
- [ ] {5|tsp|Chili Powder} (LOCKED - NOT SCALED)
- [ ] {10|tbsp|Garlic Powder}

**Note:** Chili powder kept at original amount for flavor balance
```

---

## Example 4: Half Recipe

**User:** "Half this recipe (serves 4 → 2)."

**Input:**
```markdown
# Pasta Carbonara

- [ ] {400|g|Spaghetti}
- [ ] {200|g|Bacon}
- [ ] {4|large|Eggs}
- [ ] {100|g|Parmesan Cheese}
- [ ] {2|tbsp|Olive Oil}
```

**Your Process:**
1. Current: 4 servings
2. Target: 2 servings
3. Ratio: 2 ÷ 4 = 0.5x (halving)

**Output:**
```markdown
# Pasta Carbonara (halved)

Scaling: 0.5x (4 → 2 servings)

## Ingredients
- [ ] {200|g|Spaghetti}
- [ ] {100|g|Bacon}
- [ ] {2|large|Eggs}
- [ ] {50|g|Parmesan Cheese}
- [ ] {1|tbsp|Olive Oil}
```

---

## Example 5: Temperature Conversion

**User:** "This recipe says bake at 350°F. What's that in Celsius?"

**Your Process:**
- (350 - 32) × 5/9 = 176.67°C
- Round to 175°C or 180°C for oven preset

**Output:**
```
350°F ≈ 177°C

For oven preset, use: 175°C or 180°C
(Cooking time may vary slightly, typical ±5-10 min)
```

---

## Example 6: Large Scaling (With Warning)

**User:** "Scale this from 4 to 100 servings. I know it's big."

**Input:**
```markdown
# Vanilla Cake Frosting

- [ ] {1|tsp|Vanilla Extract}
- [ ] {200|g|Butter}
- [ ] {300|g|Powdered Sugar}
```

**Your Process:**
1. Ratio: 100 ÷ 4 = 25x
2. Flag: Vanilla would be 25 tsp = 1.3 cups (expensive!)
3. Ask: Should we scale vanilla at 50% instead?

**Your Response:**
```
⚠️ Large scaling detected (25x)

Vanilla Extract would be:
1 tsp × 25 = 25 tsp = 1.3 cups (very expensive!)

Options:
1. Scale normally (25 tsp)
2. Scale at 50% (12.5 tsp) — RECOMMENDED for cost
3. Lock it (1 tsp) — very weak flavor
4. Custom amount

Which would you prefer?
```

**If user selects Option 2:**
```markdown
# Vanilla Cake Frosting (100 servings)

Scaling: 25x (with vanilla adjusted)

## Ingredients
- [ ] {12.5|tsp|Vanilla Extract} (scaled at 50% ratio)
- [ ] {5000|g|Butter} → {5|kg|Butter}
- [ ] {7500|g|Powdered Sugar} → {7.5|kg|Powdered Sugar}

**Note:** Vanilla scaled at 50% for practical cost balance
```

---

## Example 7: With Modifiers

**User:** "Double this stir-fry recipe."

**Input:**
```markdown
# Chicken Stir Fry (serves 2)

- [ ] {200|g|Chicken Breast, thinly sliced}
- [ ] {150|g|Bell Peppers, diced into 1-inch pieces}
- [ ] {100|g|Broccoli, cut into florets}
- [ ] {30|ml|Soy Sauce, low-sodium}
```

**Your Process:**
1. Ratio: 4 ÷ 2 = 2x
2. Scale amounts, preserve preparation notes

**Output:**
```markdown
# Chicken Stir Fry (serves 4)

Scaling: 2x (2 → 4 servings)

## Ingredients
- [ ] {400|g|Chicken Breast, thinly sliced}
- [ ] {300|g|Bell Peppers, diced into 1-inch pieces}
- [ ] {200|g|Broccoli, cut into florets}
- [ ] {60|ml|Soy Sauce, low-sodium}

**Note:** Preparation instructions preserved in ingredient names
```

---

## Example 8: Missing Serving Size

**User:** "How do I scale this? It doesn't say servings."

**Input:**
```markdown
# Apple Pie

- [ ] {6|medium|Apples}
- [ ] {500|g|Sugar}
- [ ] {1|cup|Flour}
```

**Your Response:**
```
This recipe doesn't state serving size.

For apple pie, typical assumption: 8 servings

Should I:
1. Assume 8 servings and scale to your target?
2. Assume different? (e.g., 6, 10 servings)
3. You tell me what it currently serves

Which option?
```

---

## Example 9: Fractional Amounts

**User:** "Scale this French dressing 2.5x."

**Input:**
```markdown
# Vinaigrette (serves 2)

- [ ] {0.75|cup|Olive Oil}
- [ ] {0.33|cup|Vinegar}
- [ ] {1.5|tbsp|Dijon Mustard}
```

**Your Process:**
1. Ratio: 2.5x
2. Handle decimals: 0.75 × 2.5 = 1.875
3. Convert & round sensibly

**Output:**
```markdown
# Vinaigrette (serves 5)

Scaling: 2.5x

## Ingredients
- [ ] {444|ml|Olive Oil}
  (0.75 cup × 2.5 = 1.875 cup ≈ 444 ml)
- [ ] {196|ml|Vinegar}
  (0.33 cup × 2.5 = 0.825 cup ≈ 196 ml)
- [ ] {56|ml|Dijon Mustard}
  (1.5 tbsp × 2.5 = 3.75 tbsp ≈ 56 ml)
```

---

## Summary

| Scenario | Key Point |
|----------|-----------|
| **Scale-up** | Calculate ratio, multiply amounts, normalize |
| **Convert** | Ratio=1x, convert units only |
| **Locked items** | Preserve at original amount |
| **Large scaling** | Flag extreme amounts, suggest adjustments |
| **Fractions** | Convert to decimals, scale, round sensibly |
| **Missing info** | Ask before proceeding |
| **Modifiers** | Keep in ingredient name |

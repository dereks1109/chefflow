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
- [ ] {1|tsp|Salt} (LOCKED)
- [ ] {250|ml|Red Wine}

## Workflow
1. Chop the onions.
2. <step thermal="stable" phase="cook">Brown the beef <Timer duration="600s">until seared</Timer>.</step>
3. <step thermal="stable" phase="cook" depends="s2">Simmer with wine <Timer duration="5400s">90 min</Timer>.</step>

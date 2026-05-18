# Plan: Legal Pages & Cookie Consent Banner

**Scope**: Four deliverables — Terms & Conditions, Cookie Consent Banner, Privacy Policy, Disclaimer.
**Audience**: UK food businesses using ChefFlow at `chefflow-derek.workers.dev`.
**Do not draft legal text in this file.** Section headers and intent only.

---

## 1. Terms & Conditions

**File**: `chefflow/src/ui/pages/legal/TermsPage.tsx` (rendered at `/terms`)

| # | Section header | Intent |
|---|---------------|--------|
| 1 | Acceptance of Terms | Confirm continued use constitutes acceptance; effective date shown on page |
| 2 | Scope of Service | Describe ChefFlow as a recipe/event management tool for professional kitchens; no warranties of fitness for commercial food service |
| 3 | Intellectual Property | User retains ownership of recipes and event data they create; ChefFlow retains ownership of the software, UI, and LLM prompt scaffolding |
| 4 | Account Termination | Conditions for suspension (abuse, non-payment if billing added); what happens to local IndexedDB data on termination (it stays on-device) |
| 5 | Third-Party Processors | Name Clerk (auth), Groq (LLM inference), Google (Maps Places autocomplete), Cloudflare (hosting, KV, Workers); link to their terms |
| 6 | LLM Content Disclaimer | Generated recipes, workflows, and allergen detections are estimates only; user is responsible for verification before service |
| 7 | Allergen Liability | Explicit waiver: the UK-14 allergen flags are LLM-derived, not certified allergen analysis; professional verification required |
| 8 | Limitation of Liability | Cap liability to fees paid in the prior 12 months; exclude indirect and consequential loss |
| 9 | Governing Law | England & Wales; exclusive jurisdiction of English courts |

---

## 2. Cookie Consent Banner

### Categories

| Category | Cookies / keys | Rationale |
|----------|---------------|-----------|
| Necessary | Clerk session token, `__session`, Clerk device ID | Required for auth; cannot be rejected without blocking sign-in — must still be disclosed |
| Preferences | `chefflow:theme`, `chefflow:unit-system` | User-selected theme (dark/light) and unit system (metric/imperial); functional but not strictly necessary |
| Analytics | — | No analytics cookies currently; reserve category for future use (e.g. Cloudflare Web Analytics) |

### Persistence

- localStorage key: `chefflow:cookie-consent-v1`
- Value shape: `{ version: 1, decided: boolean, accepted: string[] }` where `accepted` is an array of category slugs (`"necessary"`, `"preferences"`)
- Increment the version suffix (`-v2`, `-v3`) whenever categories are added or renamed; this forces the banner to re-display for returning users

### Hook design

```ts
// src/state/useCookieConsent.ts
interface ConsentState {
  decided: boolean;
  accepted: string[];
  accept: (categories: string[]) => void;
  reject: (categories: string[]) => void;
}
```

`accept` writes to localStorage and updates Zustand state (Zustand is already a dependency). `reject` removes the category from `accepted`. The hook reads from localStorage on mount to hydrate state.

> **NOTE:** Necessary cookies are pre-accepted in the initial state because Clerk initialises before the banner renders. The banner must disclose them regardless — it just cannot offer a meaningful reject path for Necessary without breaking auth. Make this clear in the banner copy.

### Mount point

Mount `<ConsentBanner />` as a sibling to the `<SignedOut>` / `<SignedIn>` blocks in `App.tsx`, outside both, so it renders regardless of auth state. This ensures first-time visitors see the banner before signing in.

```tsx
// App.tsx addition — mount point
return (
  <>
    <ConsentBanner />   {/* outside auth gates */}
    <SignedOut>…</SignedOut>
    <SignedIn>…</SignedIn>
  </>
);
```

### Re-show logic

On mount, compare the `version` field in the stored consent object against the current banner version constant. If they differ (or the key is absent), set `decided: false` and show the banner.

---

## 3. Privacy Policy

**File**: `chefflow/src/ui/pages/legal/PrivacyPage.tsx` (rendered at `/privacy`)

### Data inventory

| Data type | Where it lives | Sent to ChefFlow servers? | Retention |
|-----------|---------------|--------------------------|-----------|
| Email address, user ID | Clerk (their servers) | No — accessed via Clerk SDK | Clerk's policy; deleted on Clerk account deletion |
| Recipes, events, workflows | IndexedDB (on-device only) | **No** | Until user clears browser data or uninstalls |
| LLM prompt content (recipe text sent for AI analysis) | Groq's API | Yes, via Cloudflare Worker proxy | Groq's data retention policy (link) |
| IP address, request timing | Cloudflare logs | Yes (Cloudflare infrastructure) | Cloudflare's policy (typically 30 days) |
| Location search strings | Google Maps Places API | Yes, sent to Google on each keystroke in location field | Google's policy |

### User rights (UK GDPR / DSAR)

- **Right of access**: User can request a copy of data held by Clerk and by Groq (via the proxy logs). IndexedDB data is already directly accessible in-browser.
- **Right to erasure**: Clerk account deletion removes auth data. Groq prompt logs subject to Groq's retention policy — note this explicitly. IndexedDB erasure means clearing browser site data for `chefflow-derek.workers.dev`; document these steps.
- **Right to portability**: Recipes and events exist solely in IndexedDB. Plan a JSON export feature (or note it as a future requirement) so users can exercise portability.
- **Contact**: Provide a DSAR email address (`<TODO: privacy contact email>`).

---

## 4. Disclaimer

**File**: `chefflow/src/ui/pages/legal/DisclaimerPage.tsx` (rendered at `/disclaimer`)

Sections to cover:

1. **Cooking guidance** — ChefFlow content is informational only; not a substitute for professional chef training or food safety qualifications.
2. **Allergen warnings** — LLM allergen detection uses the UK-14 list as a heuristic. It is not a certified allergen analysis. Always verify with ingredient suppliers and a qualified allergen advisor before serving.
3. **Generated workflows** — AI-generated kitchen workflows may contain errors in timing, temperature, or sequencing. Human review is required before use in a live kitchen.
4. **Professional kitchen safety** — ChefFlow does not account for individual kitchen layouts, equipment, or team competency. Users bear full responsibility for safe operation.

---

## 5. Routing & Linking Plan

### New routes

Add four routes outside the `<SignedIn>` gate so unauthenticated users can read legal pages. Create a shared `LegalLayout` wrapper (a simple centred container with a back link) to avoid repeating markup.

```tsx
// App.tsx additions — place before or alongside SignedOut block
<Route element={<LegalLayout />}>
  <Route path="/terms"      element={<TermsPage />} />
  <Route path="/privacy"    element={<PrivacyPage />} />
  <Route path="/cookies"    element={<CookiesPage />} />
  <Route path="/disclaimer" element={<DisclaimerPage />} />
</Route>
```

`LegalLayout` does not need `AppLayout` (no sidebar/nav). It renders a plain page with a site header and a footer. No auth gate wrapping it.

### Link locations

| Location | Component | What to add |
|----------|-----------|-------------|
| App footer | `AppLayout` (`src/ui/layout/AppLayout.tsx`) | Small text row: Terms · Privacy · Cookies · Disclaimer |
| Sign-in screen | `src/ui/components/SignInScreen.tsx` | Below the Clerk `<SignIn />` component: "By signing in you agree to our [Terms] and [Privacy Policy]." |
| Cookie banner | `ConsentBanner` | "Learn more" links to `/cookies` and `/privacy` in the banner body |

---

## 6. Template vs. Hand-Write Recommendation

Use a generator (Termly, iubenda, or equivalent) for the Privacy Policy and Terms & Conditions first drafts, then have a UK-qualified solicitor review and amend for food-industry-specific liability (allergen disclaimers in particular). The cost of a one-hour legal review (~£200–£400) is far lower than the liability exposure from a poorly worded allergen waiver in a professional kitchen context. Hand-writing from scratch without legal review is the highest-risk path given the UK-14 allergen obligation and the fact that LLM-generated content makes the standard "no warranty" clauses more complex than a typical SaaS app.

---

## Open Items

- `<TODO: privacy contact email>` — required for DSAR section of Privacy Policy.
- Confirm whether Groq's current data processing terms include a DPA (Data Processing Agreement) suitable for UK GDPR processor relationships.
- JSON export for recipe/event data is not yet implemented — needed to fully honour the right to portability.
- Decision needed: will the `/terms`, `/privacy`, etc. routes render inside the Vite app (current plan) or as static HTML pages on the Worker? Static HTML avoids the JS bundle loading delay for legal pages and is simpler for crawlers.

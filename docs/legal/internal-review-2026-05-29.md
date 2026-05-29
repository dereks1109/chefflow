# Internal legal-defence review — 2026-05-29

**Author:** Internal pass (Claude). **Status:** NOT a substitute for
solicitor advice. This document records what we found in the audit,
which fixes were applied in commit `a3fa9de`, and what remains for a
UK-qualified solicitor + business-side decisions before public
launch.

## Summary

| Surface | Severity of remaining gaps | Action taken |
|---|---|---|
| `TermsPage.tsx` (`/terms`) | 🔴 needs solicitor red-line | Placeholders fixed (date + email). Solicitor `[REVIEW]` markers preserved. |
| `DisclaimerPage.tsx` (`/disclaimer`) | 🔴 needs solicitor red-line | Placeholders fixed. Solicitor `[REVIEW]` preserved. |
| `PrivacyPage.tsx` (`/privacy`) | 🟡 substantive gaps + 🔴 solicitor items | Placeholders fixed. "No data sale" line added. Solicitor `[REVIEW]` preserved. |
| `CookiesPage.tsx` (`/cookies`) | 🟢 ✅ clean | Date bumped. |
| `OnboardingSheet.tsx` consent | 🟡 missing Privacy | Privacy Policy added to consent checkbox. |
| `UpgradeSheet.tsx` | 🟢 ✅ good | No change — cooling-off waiver well-drafted. |
| `TosReacceptanceGate.tsx` | 🟢 ✅ good | No change. |
| `ConsentBanner.tsx` | 🟢 ✅ PECR-clean | No change — already best practice. |
| `CommunityDisclaimerBanner.tsx` | 🟢 ✅ good | No change. |
| Footer (`AppLayout.tsx`) | 🟢 ✅ good | No change. |

## Per-surface weaknesses + fix status

### TermsPage.tsx (`/terms`) — 🔴 needs solicitor before launch

| # | Weakness | Severity | Status |
|---|---|---|---|
| 1 | Effective date placeholder | 🟡 | ✅ Fixed → 2026-05-29 |
| 2 | `chefflow.support@[REVIEW domain]` (×3) | 🟡 | ✅ Fixed → `admin@chefflow.uk` |
| 3 | Liability cap may be unenforceable under UCTA 1977 / CRA 2015 for consumer contracts in a food-safety context | 🔴 | ⚠️ Solicitor-only — left as `[REVIEW]` |
| 4 | Exclusive-jurisdiction clause may be unenforceable for consumers under CRA 2015 | 🔴 | ⚠️ Solicitor-only — left as `[REVIEW]` |
| 5 | Recipe-copyright clause needs CDPA 1988 review | 🔴 | ⚠️ Solicitor-only — left as `[REVIEW]` |
| 6 | AI-generated content IP status under CDPA s.9(3) + post-Thaler caselaw unclear | 🔴 | ⚠️ Solicitor-only — left as `[REVIEW]` |
| 7 | No ADR mechanism pointer (required for consumer disputes under ADR Regs 2015 if you accept consumer chefs) | 🟡 | ⚠️ Solicitor + business call — left as `[REVIEW]` |
| 8 | No explicit "force majeure" clause | 🟢 | Defensible without; flag for solicitor |
| 9 | Section 9 cancellation copy is solid; cooling-off waiver paragraph is well-drafted | ✅ | No action |

### DisclaimerPage.tsx (`/disclaimer`) — 🔴 needs solicitor

| # | Weakness | Severity | Status |
|---|---|---|---|
| 1 | Support email placeholder | 🟡 | ✅ Fixed → `admin@chefflow.uk` |
| 2 | Liability cap enforceability under s.2(1) UCTA 1977 | 🔴 | ⚠️ Solicitor-only — left as `[REVIEW]` |
| 3 | "Natasha's Law / PPDS" reference may need updating depending on the chef's specific business category (caterer, supper club, distance sale) | 🟡 | ⚠️ Business call — left as `[REVIEW]` |
| 4 | Allergen disclaimer is strong (cross-contamination, supplier labels, FSA pointer) | ✅ | No action |
| 5 | AI content disclaimer is strong (quantities, temps, allergen ID, timing) | ✅ | No action |

### PrivacyPage.tsx (`/privacy`) — 🟡 substantive gaps + 🔴 solicitor items

| # | Weakness | Severity | Status |
|---|---|---|---|
| 1 | DPO email placeholder (×2) | 🟡 | ✅ Fixed → `admin@chefflow.uk` |
| 2 | "Community publishing consent — confirm genuine opt-in" placeholder | 🟡 | ✅ Fixed — copy now describes the `AllergenAttestationModal`-gated flow explicitly |
| 3 | **Missing: "We don't sell your data" disclosure** (standard for UK privacy policies; expected by data-subject readers) | 🟡 | ✅ Fixed — added to opening section |
| 4 | Data controller entity placeholder (ChefFlow Ltd / sole trader, registered address, ICO number) | 🔴 | ⚠️ Business call — left as `[REVIEW]` |
| 5 | Groq UK IDTA / transfer-mechanism status not documented | 🔴 | ⚠️ Business call — left as `[REVIEW]` (potentially blocking — get this confirmed before launch) |
| 6 | Stripe transfer mechanism (entity + mechanism) not confirmed | 🔴 | ⚠️ Business call — left as `[REVIEW]` |
| 7 | Cloudflare transfer mechanism not confirmed | 🟡 | ⚠️ Business call — left as `[REVIEW]` |
| 8 | Cloudflare logs LIA not documented | 🟡 | ⚠️ Business call — left as `[REVIEW]` |
| 9 | Stripe retention period not confirmed with accountant | 🟢 | ⚠️ Business call — left as `[REVIEW]` |
| 10 | Groq retention policy not confirmed | 🟡 | ⚠️ Business call — left as `[REVIEW]` |
| 11 | No explicit list of data categories EVER shared with sub-processors (vs. what stays local) | 🟢 | Already covered in §2 per-feature; defensible |

### OnboardingSheet (sign-up consent) — 🟡 substantive gap fixed

| # | Weakness | Severity | Status |
|---|---|---|---|
| 1 | **Consent checkbox only required Terms + Disclaimer; Privacy Policy was footer-only.** Best practice: Privacy is the basis under which you process data and should be on the sign-up consent. | 🟡 | ✅ Fixed — checkbox now requires all three |
| 2 | Strong allergen attestation ("I am the food business operator") — keep | ✅ | No action |
| 3 | No CCR cooling-off explanation here, but it's on the UpgradeSheet (where it belongs) | ✅ | No action |

### UpgradeSheet (paid-tier checkout) — 🟢 well-drafted

The cooling-off waiver block is good practice — explicit consent
ticked separately from the price acceptance, with clear language
about why consumer rights are being waived. Keep as is.

### TosReacceptanceGate (version-bump modal) — 🟢 good

Non-dismissible re-acceptance is standard. No change.

### ConsentBanner (cookie consent) — 🟢 PECR-clean

Multiple structural strengths:
- Reject button has the same prominence as Accept (ICO requires this; some sites still fail it).
- Esc key = "reject non-essential" (anti-dark-pattern; ICO best practice).
- Customise is inline (no separate page).
- No pre-ticked non-essential categories.

### CommunityDisclaimerBanner — 🟢 good

Both `full` and `compact` variants name the Food Information
Regulations 2014 and frame the chef as the FBO. Strong defence-
in-depth.

### Footer (AppLayout) — 🟢 good

All four legal links present. "Cookie preferences" button re-opens
the banner.

---

## What to do before public launch

Items deliberately NOT touched in commit `a3fa9de` because they
require solicitor input or a business decision. Rough priority
order:

1. **🔴 Get a UK-qualified solicitor to red-line `TermsPage.tsx` +
   `DisclaimerPage.tsx`**, focusing on:
   - Liability cap (UCTA 1977 s.2(1) + CRA 2015)
   - Jurisdiction clause (CRA 2015 restrictions on consumer contracts)
   - Recipe-copyright clause (UK caselaw on recipe IP)
   - AI-generated content IP (CDPA 1988 s.9(3) + Thaler v Comptroller-General).

2. **🔴 Resolve the Groq UK transfer-mechanism question** in
   `PrivacyPage` §2 "AI feature content" + §3 "Sub-processors". If
   Groq hasn't signed a UK IDTA or equivalent, the AI features may
   be transferring personal data to the US without a valid Article
   46 mechanism — that's a 🔴 GDPR risk that a solicitor needs to
   advise on (either suspend AI features for UK users, or sign an
   IDTA).

3. **🟡 Confirm the data controller entity** — sole trader vs
   "ChefFlow Ltd". If ChefFlow Ltd doesn't exist, change the
   controller line to your sole-trader name. If it does exist, add
   the Companies House number and registered address.

4. **🟡 ICO registration** — if you're a sole trader processing
   personal data of UK residents (which you are — Clerk emails,
   Stripe metadata), you need to register with the ICO and pay the
   data protection fee (£40-£60/year for small organisations). The
   ICO number then goes into `PrivacyPage` §1.

5. **🟡 Document the LIAs** for any Article 6(1)(f) legitimate-
   interests bases (Cloudflare infrastructure logs). A short
   internal doc suffices; you don't have to publish it, but you
   should be able to produce it if the ICO ever asks.

---

## Cross-reference — companion documents

- `docs/legal/companies-house-checklist.md` — entity-registration checklist.
- `docs/legal/solicitor-outreach-email.md` — template for engaging a UK solicitor.

This document is for internal reference. It is not legal advice and
does not bind a solicitor's eventual red-line. The `[REVIEW]`
markers in the source files remain the canonical to-do list for
launch.

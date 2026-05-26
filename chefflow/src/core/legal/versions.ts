// Current versions of the Terms of Service + Disclaimer that ChefFlow
// asks the chef to accept during onboarding. Bump these dates when the
// corresponding `legal/TermsPage.tsx` / `legal/DisclaimerPage.tsx` text
// changes substantively (typo fixes don't count) — the re-acceptance nag
// flow (`useTosGate`) compares the chef's stored `tosVersion` /
// `disclaimerVersion` in Clerk publicMetadata against these constants
// and re-prompts when they differ.
//
// Format: ISO date (YYYY-MM-DD). The worker stores these strings in
// Clerk publicMetadata + D1 `tos_acceptances` exactly as sent — no
// canonicalisation, so spelling variants would create false mismatches.

export const CURRENT_TOS_VERSION = '2026-05-26';
export const CURRENT_DISCLAIMER_VERSION = '2026-05-26';

import LegalLayout from './LegalLayout';

export default function CookiesPage() {
  return (
    <LegalLayout title="Cookie Policy" lastUpdated="2026-05-29">
      <p>
        This policy describes the cookies and browser-storage keys ChefFlow uses, why we use them,
        and how to manage them. Under UK PECR we must obtain your consent before setting any
        non-essential cookies.
      </p>

      <h2 className="text-xl md:text-2xl font-semibold">1. What we mean by "cookies"</h2>
      <p>
        ChefFlow uses a mix of HTTP cookies (set by Clerk for authentication) and localStorage keys
        (set directly by ChefFlow). We refer to both collectively as "cookies" throughout this
        policy.
      </p>

      <h2 className="text-xl md:text-2xl font-semibold">2. Cookie categories</h2>

      <h3 className="text-lg md:text-xl font-semibold">Necessary</h3>
      <p>
        These are required for ChefFlow to function. You cannot opt out without losing sign-in
        access. We disclose them here because UK PECR requires it even for strictly-necessary
        storage.
      </p>
      <ul>
        <li><strong>Clerk session token / <code>__session</code></strong> — keeps you signed in. Set and managed by Clerk, Inc. (US processor with UK DPA).</li>
        <li><strong>Clerk device ID</strong> — device fingerprint used by Clerk for suspicious-login detection.</li>
        <li><strong><code>chefflow:cookie-consent-v1</code></strong> (localStorage) — records your cookie consent choices so we don't show the banner on every visit.</li>
      </ul>

      <h3 className="text-lg md:text-xl font-semibold">Preferences</h3>
      <p>
        These remember your in-app choices between visits. They are functional but not strictly
        necessary — ChefFlow works without them, it just won't remember your settings.
      </p>
      <ul>
        <li><strong><code>chefflow:theme</code></strong> (localStorage) — your chosen colour theme (dark / light).</li>
        <li><strong><code>chefflow:unit-system</code></strong> (localStorage) — your preferred unit system (metric / imperial).</li>
      </ul>

      <h3 className="text-lg md:text-xl font-semibold">Analytics</h3>
      <p>
        No analytics cookies are loaded today. This category is reserved for future use (for example,
        Cloudflare Web Analytics). We will update this policy and request fresh consent before
        loading any analytics.
      </p>

      <h2 className="text-xl md:text-2xl font-semibold">3. Managing your consent</h2>
      <p>
        When you first visit ChefFlow a consent banner lets you accept all, reject non-essential, or
        customise by category. You can reopen your choices at any time via the "Cookies" link in the
        page footer.
      </p>
      <p>
        To remove all ChefFlow storage from your browser, open your browser settings, find site data
        for this domain, and clear it. This will also sign you out.
      </p>

      <h2 className="text-xl md:text-2xl font-semibold">4. Third-party cookies</h2>
      <p>
        Clerk may set additional cookies on its own domain as part of the sign-in flow. These are
        governed by <a href="https://clerk.com/legal/privacy" target="_blank" rel="noreferrer">Clerk's Privacy Policy</a>.
        ChefFlow does not control or have access to Clerk's domain-scoped cookies.
      </p>

      <p><em>This document is a plain-English summary, not legal advice. Have a UK-qualified solicitor review before public launch.</em></p>
    </LegalLayout>
  );
}

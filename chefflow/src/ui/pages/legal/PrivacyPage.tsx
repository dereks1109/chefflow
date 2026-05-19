import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="2026-05-19">
      <p>
        ChefFlow is operated as a sole-trader / small business targeting UK food professionals. This
        policy explains what data we collect, where it goes, and your rights under UK GDPR.
      </p>

      <h2>What we collect and where it goes</h2>

      <h3>Authentication data — Clerk (US processor)</h3>
      <p>
        Your email address and a user identifier are managed by Clerk, Inc., a US-based processor.
        Clerk operates under a UK Data Processing Addendum (UK DPA) — see{' '}
        <a href="https://clerk.com/legal/dpa" target="_blank" rel="noreferrer">Clerk's DPA page</a>.
        We do not receive or store your password. ChefFlow accesses only the user ID and email that
        Clerk provides via its SDK.
      </p>

      <h3>Recipes, events, and workflows — on-device only</h3>
      <p>
        All recipe, event, and workflow data you create in ChefFlow is stored exclusively in your
        browser's IndexedDB. This data is <strong>not transmitted to ChefFlow servers</strong>. It
        remains on your device until you clear your browser's site data for this domain.
      </p>

      <h3>LLM prompt content — Groq (US processor)</h3>
      <p>
        When you use AI features (event extraction, recipe generation, menu checks, workflow
        generation), the relevant text you have typed is sent to Groq, Inc., a US-based LLM
        provider, via a Cloudflare Worker proxy. The proxy adds JWT bearer authentication and
        enforces a daily quota counter stored in Cloudflare KV — no prompt content is written to
        KV. Groq's UK International Data Transfer Agreement (IDTA) status is pending; until
        confirmed, prompt content may be processed in the United States under Groq's standard terms.
        See <a href="https://groq.com/privacy-policy/" target="_blank" rel="noreferrer">Groq's Privacy Policy</a>.
      </p>
      <p>
        ChefFlow's allergen detection is LLM-estimated and informational. Always verify allergens
        against your own sourcing before serving. The platform is a tool — operational food-safety
        responsibility remains with the regulated food business.
      </p>

      <h3>Location search strings — Google</h3>
      <p>
        When you type in a location field, search strings are sent to the Google Maps Places API.
        See <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google's Privacy Policy</a>.
      </p>

      <h3>Infrastructure logs — Cloudflare</h3>
      <p>
        Cloudflare logs your IP address and request timing as part of normal hosting operations.
        Cloudflare retains these logs for approximately 30 days. See{' '}
        <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare's Privacy Policy</a>.
      </p>

      <h2>Your rights under UK GDPR</h2>
      <ul>
        <li>
          <strong>Access:</strong> You can request a copy of data held by Clerk or visible in
          Cloudflare / Groq proxy logs by contacting us. Your IndexedDB data is already directly
          accessible in your browser's DevTools.
        </li>
        <li>
          <strong>Erasure:</strong> Deleting your Clerk account removes auth data. Groq prompt logs
          are subject to Groq's own retention policy, which we cannot override. To erase on-device
          data, clear site data for this domain in your browser settings.
        </li>
        <li>
          <strong>Portability:</strong> Your recipes and events exist in IndexedDB. A JSON export
          feature is planned to let you exercise portability without browser DevTools.
        </li>
        <li>
          <strong>Objection / restriction:</strong> Contact us using the address below.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        For full details of cookies and local-storage keys ChefFlow uses, see our{' '}
        <a href="/cookies">Cookie Policy</a>.
      </p>

      <p>Data protection enquiries: <em>privacy contact email pending</em>.</p>

      <p><em>This document is a plain-English summary, not legal advice. Have a UK-qualified solicitor review before public launch.</em></p>
    </LegalLayout>
  );
}

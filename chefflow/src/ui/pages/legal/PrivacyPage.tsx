import LegalLayout from './LegalLayout';
import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="2026-05-21">
      <p>
        This policy explains what personal data ChefFlow collects, why we collect it, where it goes,
        and what rights you have under UK GDPR. We have written it in plain English because you
        should be able to understand what you agreed to.
      </p>

      <h2 id="controller" className="text-xl md:text-2xl font-semibold">1. Data controller</h2>
      <p>
        The data controller for personal data processed by ChefFlow is ChefFlow Ltd,{' '}
        [REVIEW registered address]. ICO registration number: [REVIEW ICO registration number].
        [REVIEW: confirm company registration at Companies House and ICO registration before
        publishing. If currently operating as a sole trader, update the controller entity
        accordingly.]
      </p>

      <h2 id="what-we-collect" className="text-xl md:text-2xl font-semibold">2. What we collect and why</h2>

      <h3 id="account-data" className="text-lg md:text-xl font-semibold">Account data — Clerk</h3>
      <p>
        When you sign in, Clerk (Clerk, Inc., a US company) collects your email address and creates
        a user identifier on our behalf. We receive only that user ID and email address via Clerk's
        SDK; we never see your password. We use this data to identify your account, enforce your
        subscription status, and contact you about the service.
      </p>
      <p>
        <strong>Lawful basis:</strong> Article 6(1)(b) UK GDPR — necessary to perform our contract
        with you.
      </p>
      <p>
        Clerk operates under a UK Data Processing Addendum (UK DPA). See{' '}
        <a href="https://clerk.com/legal/dpa" target="_blank" rel="noreferrer">clerk.com/legal/dpa</a>.
      </p>

      <h3 id="payment-data" className="text-lg md:text-xl font-semibold">Subscription and payment data — Stripe</h3>
      <p>
        If you subscribe to ChefFlow Pro, billing is handled by Stripe. ChefFlow receives
        subscription status (active, cancelled, trial) and the date your subscription renews. We do
        not receive or store your card number, bank details, or full payment card data — Stripe holds
        those under PCI DSS compliance.
      </p>
      <p>
        <strong>Lawful basis:</strong> Article 6(1)(b) UK GDPR — necessary to perform our contract
        with you (billing and subscription management).
      </p>
      <p>
        See <a href="https://stripe.com/gb/privacy" target="_blank" rel="noreferrer">Stripe's Privacy Policy</a>.
      </p>

      <h3 id="local-data" className="text-lg md:text-xl font-semibold">Recipes, events, and workflows — on your device only</h3>
      <p>
        All recipes, events, notes, and workflows you create in ChefFlow are stored exclusively in
        your browser's IndexedDB (via Dexie). This data does not leave your device and is not
        transmitted to ChefFlow's servers unless you choose to publish a recipe to the community
        library (see below). You can view, export, or delete this data at any time using your
        browser's site-data settings.
      </p>
      <p>
        <strong>Lawful basis:</strong> Not applicable — this data is not processed by ChefFlow;
        it remains on your device under your own control.
      </p>

      <h3 id="community-recipes" className="text-lg md:text-xl font-semibold">Community-published recipes</h3>
      <p>
        If you choose to publish a recipe to the ChefFlow community library, that recipe (including
        its title, ingredients, method, and any metadata you include) is stored on Cloudflare KV and
        made publicly accessible to other ChefFlow users. Your display name or identifier may be
        shown alongside the recipe. You can unpublish a recipe at any time, which removes it from
        the community library.
      </p>
      <p>
        <strong>Lawful basis:</strong> Article 6(1)(a) UK GDPR — consent (you opt in by choosing
        to publish). [REVIEW: confirm this is implemented as a genuine opt-in action, not pre-ticked
        or default-on.]
      </p>

      <h3 id="ai-data" className="text-lg md:text-xl font-semibold">AI feature content — Groq via Cloudflare Workers</h3>
      <p>
        When you use AI features (recipe generation, event extraction, menu checks, workflow
        planning), the text you have typed — such as a recipe description or event brief — is
        transmitted to our Cloudflare Worker, which forwards it to Groq, Inc., a US-based LLM
        provider. Groq processes the text to generate a response and does not retain it for training
        purposes under its standard API terms. [REVIEW: verify Groq's current contractual commitment
        on training data use and retention before publishing.]
      </p>
      <p>
        The Cloudflare Worker also records a per-user daily quota counter in Cloudflare KV to
        enforce free-tier rate limits. This counter contains only a user ID and a request count —
        no prompt content is written to KV.
      </p>
      <p>
        <strong>Lawful basis:</strong> Article 6(1)(b) UK GDPR — necessary to provide the AI
        features you have requested as part of the service.
      </p>
      <p>
        <strong>International transfer:</strong> Groq is based in the United States. Data sent to
        Groq is transferred outside the UK. Groq's UK International Data Transfer Agreement (IDTA)
        status is [REVIEW: confirm whether Groq has signed a UK IDTA or equivalent mechanism, and
        document it here before publishing. If no IDTA is in place, this transfer may lack an
        adequate transfer mechanism and should be reviewed by a solicitor.].
      </p>

      <h3 id="infrastructure" className="text-lg md:text-xl font-semibold">Infrastructure logs — Cloudflare</h3>
      <p>
        Cloudflare records IP addresses, request paths, and response times as part of normal hosting
        and DDoS protection. Cloudflare retains these logs for approximately 30 days. ChefFlow does
        not access individual-level log data for purposes other than diagnosing service incidents.
      </p>
      <p>
        <strong>Lawful basis:</strong> Article 6(1)(f) UK GDPR — legitimate interests (maintaining
        service security and availability). [REVIEW: document a legitimate-interests assessment (LIA)
        for this basis before launch.]
      </p>
      <p>
        See <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare's Privacy Policy</a>.
      </p>

      <h3 id="location" className="text-lg md:text-xl font-semibold">Location search strings — Google Maps</h3>
      <p>
        When you type a location in an event field, the search string is sent to the Google Maps
        Places API to return address suggestions. Google processes this as described in its own
        privacy policy. We do not store the search strings.
      </p>
      <p>
        See <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google's Privacy Policy</a>.
      </p>

      <h2 id="sub-processors" className="text-xl md:text-2xl font-semibold">3. Sub-processors</h2>
      <p>The following companies process personal data on our behalf:</p>
      <ul>
        <li>
          <strong>Clerk, Inc.</strong> (US) — authentication and user management. Transfer
          mechanism: UK Data Processing Addendum.
        </li>
        <li>
          <strong>Stripe, Inc.</strong> (UK entity: Stripe Payments Europe, Ltd / Stripe UK) —
          payment processing. Transfer mechanism: UK adequacy / standard contractual clauses.
          [REVIEW: verify current Stripe entity and transfer mechanism.]
        </li>
        <li>
          <strong>Cloudflare, Inc.</strong> (UK edge nodes + US HQ) — hosting, Workers runtime, KV
          storage. Transfer mechanism: Standard Contractual Clauses (SCCs) with UK addendum.
          [REVIEW: confirm Cloudflare's current UK transfer mechanism documentation.]
        </li>
        <li>
          <strong>Groq, Inc.</strong> (US) — LLM inference. Transfer mechanism: [REVIEW: confirm
          UK IDTA, SCCs, or other adequate mechanism before launch.]
        </li>
        <li>
          <strong>Google LLC</strong> (US) — Maps Places API for location search. Transfer
          mechanism: SCCs / UK addendum. [REVIEW: confirm current mechanism.]
        </li>
      </ul>

      <h2 id="retention" className="text-xl md:text-2xl font-semibold">4. Data retention</h2>
      <ul>
        <li>
          <strong>Account data (Clerk):</strong> retained for the life of your account and deleted
          within 90 days of account closure or deletion.
        </li>
        <li>
          <strong>Subscription metadata (Stripe):</strong> retained for seven years to comply with
          UK tax and accounting obligations. [REVIEW: confirm retention period with accountant.]
        </li>
        <li>
          <strong>AI prompt content (Groq):</strong> not retained by ChefFlow. Subject to Groq's
          own retention policy (typically not used for training under API terms). [REVIEW: confirm.]
        </li>
        <li>
          <strong>Cloudflare infrastructure logs:</strong> approximately 30 days (Cloudflare's
          standard retention).
        </li>
        <li>
          <strong>On-device data (IndexedDB):</strong> retained until you clear your browser's
          site data for this domain. ChefFlow has no remote access to this data.
        </li>
        <li>
          <strong>Community-published recipes:</strong> retained until you unpublish them, plus a
          reasonable technical propagation delay (typically under 24 hours).
        </li>
      </ul>

      <h2 id="your-rights" className="text-xl md:text-2xl font-semibold">5. Your rights under UK GDPR</h2>
      <p>
        You have the following rights in relation to personal data ChefFlow controls. To exercise
        any right, email <a href="mailto:[REVIEW DPO email]">[REVIEW DPO email]</a>. We will respond
        within 30 days. [REVIEW: confirm response-time SLA and DPO email address before launch.]
      </p>
      <ul>
        <li>
          <strong>Access (Article 15):</strong> request a copy of the personal data we hold about
          you.
        </li>
        <li>
          <strong>Rectification (Article 16):</strong> ask us to correct inaccurate data.
        </li>
        <li>
          <strong>Erasure (Article 17):</strong> request deletion of your personal data where we no
          longer have a legal basis to hold it. Note: your on-device IndexedDB data is under your
          own control — clear it via your browser's site-data settings.
        </li>
        <li>
          <strong>Portability (Article 20):</strong> receive a machine-readable copy of data you
          provided to us. Your recipe and event data already lives in your browser's IndexedDB. A
          JSON export tool is planned for a future release.
        </li>
        <li>
          <strong>Restriction (Article 18):</strong> ask us to restrict processing while a dispute
          is resolved.
        </li>
        <li>
          <strong>Objection (Article 21):</strong> object to processing based on legitimate
          interests. We will cease processing unless we can demonstrate compelling legitimate grounds.
        </li>
        <li>
          <strong>Withdraw consent:</strong> where processing is based on your consent (e.g.,
          community publishing), you may withdraw consent at any time by unpublishing your recipes
          or contacting us. Withdrawal does not affect the lawfulness of processing before
          withdrawal.
        </li>
      </ul>

      <h2 id="cookies" className="text-xl md:text-2xl font-semibold">6. Cookies and local storage</h2>
      <p>
        ChefFlow uses cookies for authentication (set by Clerk) and local-storage keys for UI
        preferences such as your unit system and theme. For a full list, see our{' '}
        <Link to="/cookies">Cookie Policy</Link>.
      </p>

      <h2 id="complaints" className="text-xl md:text-2xl font-semibold">7. Complaints</h2>
      <p>
        If you are unhappy with how we have handled your personal data, you have the right to lodge
        a complaint with the UK Information Commissioner's Office (ICO) at{' '}
        <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noreferrer">ico.org.uk/make-a-complaint</a>.
        We would, however, appreciate the opportunity to address your concern first — please contact
        us at <a href="mailto:[REVIEW DPO email]">[REVIEW DPO email]</a> before escalating to the
        ICO.
      </p>

      <h2 id="changes" className="text-xl md:text-2xl font-semibold">8. Changes to this policy</h2>
      <p>
        If we make material changes to this policy, we will notify you by email at least 30 days
        before the changes take effect and update the "last updated" date at the top of this page.
        We will obtain fresh consent where required by law.
      </p>

      <p>
        <em>
          This is a draft document prepared for solicitor review. It is not finalized legal advice.
          A UK-qualified solicitor should red-line this document before it is published. Search for
          [REVIEW] to find items requiring specific legal or business input.
        </em>
      </p>
    </LegalLayout>
  );
}

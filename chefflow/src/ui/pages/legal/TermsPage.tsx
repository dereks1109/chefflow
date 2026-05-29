import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms &amp; Conditions" lastUpdated="2026-05-29">
      <p>
        Effective date: 2026-05-29. Last updated: 2026-05-29.
      </p>
      <p>
        These Terms and Conditions ("Terms") govern your access to and use of ChefFlow. Please read
        them carefully. By signing in or continuing to use ChefFlow, you agree to these Terms. If
        you do not agree, do not use the service.
      </p>

      <h2 id="acceptance" className="text-xl md:text-2xl font-semibold">1. Acceptance</h2>
      <p>
        By creating an account or accessing ChefFlow, you confirm that you have read, understood,
        and accepted these Terms. If you are using ChefFlow on behalf of a food business or other
        organisation, you confirm that you have authority to bind that organisation and that your
        acceptance of these Terms constitutes the organisation's acceptance.
      </p>
      <p>
        We may update these Terms from time to time. We will give you at least 30 days' notice of
        material changes by email before they take effect. Continued use of ChefFlow after the
        effective date of any change constitutes acceptance of the updated Terms.
      </p>

      <h2 id="service-description" className="text-xl md:text-2xl font-semibold">2. What ChefFlow is</h2>
      <p>
        ChefFlow is a kitchen-planning tool for professional chefs, including private chefs, supper
        clubs, and small catering businesses. The core features are:
      </p>
      <ul>
        <li>Recipe creation, storage, and management (stored locally in your browser).</li>
        <li>Event and menu planning, including guest counts and dish scheduling.</li>
        <li>AI-assisted recipe drafting, workflow generation, and event extraction via the AI Co-Chef.</li>
        <li>A community library where chefs can optionally publish and discover recipes.</li>
      </ul>
      <p>
        ChefFlow is a productivity aid. It is not a food-safety management system, an allergen
        certification service, or a regulatory compliance tool. It does not replace professional
        training, HACCP documentation, or the judgment of a qualified chef. See also our{' '}
        <a href="/disclaimer">Disclaimer</a>.
      </p>

      <h2 id="eligibility" className="text-xl md:text-2xl font-semibold">3. Eligibility</h2>
      <p>
        You must be at least 18 years old to use ChefFlow. By accepting these Terms you confirm that
        you are 18 or older. [REVIEW: if ChefFlow is ever made available to educational or training
        contexts involving under-18s, this clause will need updating.]
      </p>
      <p>
        Pro subscriptions are priced and billed in GBP and are currently available to users with a
        UK billing address. [REVIEW: confirm whether international billing is intended and update the
        eligibility clause accordingly.]
      </p>

      <h2 id="account" className="text-xl md:text-2xl font-semibold">4. Your account and responsibilities</h2>
      <p>
        You are responsible for keeping your account credentials secure. Do not share your login with
        anyone else. If you believe your account has been compromised, contact us immediately.
      </p>
      <p>
        You are responsible for all content you upload, create, or publish through ChefFlow,
        including recipes, event data, notes, and any images. In particular:
      </p>
      <ul>
        <li>
          Do not upload or publish content you do not have the right to use. This includes
          reproducing copyrighted recipes verbatim from cookbooks, other publications, or third-party
          websites without a licence or valid fair-dealing justification. Adapting a recipe into your
          own version, in your own words, is generally acceptable — direct verbatim reproduction is
          not. [REVIEW: a solicitor should clarify the copyright position for recipes given the
          relevant UK caselaw on recipe copyright.]
        </li>
        <li>
          Do not upload content that is offensive, defamatory, discriminatory, or illegal under UK
          law.
        </li>
        <li>
          Do not use ChefFlow to process personal data about third parties (such as client dietary
          requirements) without a lawful basis under UK GDPR. ChefFlow's local-storage architecture
          means we do not process that data, but your own data-controller obligations still apply.
          [REVIEW: whether ChefFlow should provide GDPR guidance for chefs processing guest dietary
          data.]
        </li>
      </ul>

      <h2 id="acceptable-use" className="text-xl md:text-2xl font-semibold">5. Acceptable use</h2>
      <p>You must not use ChefFlow to:</p>
      <ul>
        <li>Send spam, unsolicited messages, or promotional content to other users.</li>
        <li>Harass, threaten, or abuse other users or ChefFlow staff.</li>
        <li>Upload or distribute malware, viruses, or other harmful code.</li>
        <li>Circumvent, disable, or interfere with rate-limiting, quota enforcement, or authentication systems.</li>
        <li>
          Scrape, crawl, or mass-download community recipes or any other platform content by
          automated means, except where we have provided an official export API or tool for that
          purpose.
        </li>
        <li>
          Attempt to reverse-engineer, decompile, or copy ChefFlow's software, prompts, or
          infrastructure.
        </li>
        <li>
          Use ChefFlow in any way that violates applicable UK or international law.
        </li>
      </ul>

      <h2 id="community" className="text-xl md:text-2xl font-semibold">6. Community recipe library</h2>
      <p>
        ChefFlow includes an optional community library where chefs can publish recipes for other
        users to view and copy. The following terms apply when you publish a recipe:
      </p>
      <ul>
        <li>
          <strong>Licence you grant us:</strong> by publishing a recipe to the community library,
          you grant ChefFlow a non-exclusive, worldwide, royalty-free licence to display, store, and
          serve that recipe to other ChefFlow users for as long as the recipe remains published. You
          retain ownership of the recipe.
        </li>
        <li>
          <strong>Licence other chefs receive:</strong> other ChefFlow users may copy a published
          recipe into their own local library for personal professional use. This is an intended and
          expected feature of the community library. Chefs may adapt copied recipes freely. They may
          not republish a copied recipe as their own original work without adaptation.
        </li>
        <li>
          <strong>Unpublishing:</strong> you can unpublish a recipe at any time. This removes it
          from the community library, though copies already taken by other users into their local
          library are not affected (and cannot be remotely deleted, as they exist in other users'
          local IndexedDB).
        </li>
        <li>
          <strong>Content standards:</strong> published recipes must comply with the acceptable-use
          requirements in clause 5 above. We reserve the right to remove published content that
          violates these Terms without notice.
        </li>
        <li>
          <strong>Notice-and-takedown:</strong> if you believe a published recipe infringes your
          copyright, contains misleading allergen information, or otherwise violates these Terms,
          you can flag it directly from the recipe's public page using the "Report" button (visible
          to any signed-in user), or you can email <a href="mailto:legal@chefflow.uk">legal@chefflow.uk</a>{' '}
          with the community recipe ID and a description of the issue. We aim to review and act on
          all reports within 7 days. Rights-holders may include any evidence they consider relevant
          (e.g. a link to the original source). We may unpublish content while a report is under
          review.
        </li>
        <li>
          <strong>Allergen attestation:</strong> when you publish a recipe to the community, ChefFlow
          asks you to confirm you have verified the detected allergen tags against your supplier
          labels. ChefFlow's automated allergen detection is best-effort. Final responsibility for
          allergen accuracy rests with you as the food business operator under the Food Information
          Regulations 2014.
        </li>
      </ul>

      <h2 id="ip" className="text-xl md:text-2xl font-semibold">7. Intellectual property</h2>
      <p>
        You retain ownership of all recipes, events, notes, and other original content you create in
        ChefFlow. You grant ChefFlow the limited, transient licence necessary to deliver the service
        — for example, to pass your recipe text to the AI Co-Chef and return a result to you.
      </p>
      <p>
        ChefFlow owns the software, user interface, design, branding, and all LLM prompt
        scaffolding. Nothing in these Terms transfers ownership of that intellectual property to you.
        You may not copy, reproduce, modify, or create derivative works of the ChefFlow software
        without our written permission.
      </p>
      <p>
        AI-generated outputs (e.g., a recipe draft produced by the AI Co-Chef in response to your
        input) are provided to you for your use. ChefFlow makes no claim of ownership over those
        outputs. [REVIEW: the IP status of AI-generated content under UK law is still developing —
        a solicitor should confirm this position, particularly in light of CDPA 1988 s.9(3) and
        any emerging post-Thaler caselaw.]
      </p>

      <h2 id="ai-disclaimer" className="text-xl md:text-2xl font-semibold">8. AI-generated content and allergen liability</h2>
      <p>
        AI-generated recipes, workflows, and allergen tags are produced by a large-language model.
        They may contain errors. You must verify all AI-generated content before using it in a
        professional kitchen, including allergen checks against your supplier data. ChefFlow's
        allergen tagging is best-effort and is not a certified allergen analysis. Full details are in
        our <a href="/disclaimer">Disclaimer</a>.
      </p>
      <p>
        Operational food-safety responsibility remains with you as the regulated food business
        operator. ChefFlow is not liable for harm arising from reliance on AI-generated content or
        allergen information.
      </p>

      <h2 id="pricing" className="text-xl md:text-2xl font-semibold">9. Pricing &amp; cancellation</h2>
      <p>
        ChefFlow offers two paid tiers. All prices are GBP and quoted inclusive of any VAT we are
        required to collect. The current prices are also shown in the in-app upgrade sheet and on
        the Stripe checkout page before you pay; the price on the checkout page is authoritative.
      </p>
      <ul>
        <li><strong>Pro:</strong> £12.00 / month or £108.00 / year (equivalent to £9.00/month).</li>
        <li><strong>Enterprise:</strong> £50.00 / month or £450.00 / year (equivalent to £37.50/month).</li>
      </ul>
      <p>
        Billing is handled by Stripe. Subscriptions renew automatically at the end of each billing
        period unless you cancel. You can cancel at any time from the Customer Portal (linked from
        the upgrade sheet and from Settings); cancellation takes effect at the end of the current
        billing period and you retain access until then. You will receive an email receipt from
        Stripe on each renewal and a confirmation email on cancellation.
      </p>
      <p>
        <strong>Cooling-off waiver (Consumer Contracts Regulations 2013):</strong> Under the CCR 2013
        a UK consumer normally has a 14-day right to cancel a distance contract for a full refund.
        Because the paid features become available immediately on payment, the in-app upgrade sheet
        asks you to expressly waive this 14-day right before you can complete checkout. By ticking
        that box you agree the subscription begins immediately and that the cooling-off right does
        not apply once paid features have been provided. If you did not see that confirmation or
        believe it was not displayed correctly, please contact{' '}
        <a href="mailto:billing@chefflow.uk">billing@chefflow.uk</a> within 14 days of your first
        payment.
      </p>
      <p>
        After the cooling-off waiver, subscription fees for the current billing period are
        non-refundable except where required by law (for example, a service outage that materially
        prevented use of the paid features, judged in good faith on a case-by-case basis).
      </p>

      <h2 id="free-tier" className="text-xl md:text-2xl font-semibold">10. Free tier</h2>
      <p>
        ChefFlow offers a free tier with daily caps on recipe creation, event creation, and AI
        Co-Chef calls. Current limits are displayed in the app. We may change free-tier limits at
        any time. For a reduction in free-tier allowances, we will give users at least 14 days'
        notice via an in-app banner or email. [REVIEW: confirm the notice period and mechanism you
        intend to use in practice.]
      </p>

      <h2 id="third-parties" className="text-xl md:text-2xl font-semibold">11. Third-party services</h2>
      <p>
        ChefFlow depends on the following third-party services. Their terms and privacy policies
        govern their own processing of your data:
      </p>
      <ul>
        <li><strong>Clerk</strong> — authentication (<a href="https://clerk.com/legal/terms" target="_blank" rel="noreferrer">Terms</a>)</li>
        <li><strong>Stripe</strong> — payments (<a href="https://stripe.com/gb/legal" target="_blank" rel="noreferrer">Terms</a>)</li>
        <li><strong>Groq</strong> — LLM inference (<a href="https://groq.com/terms-of-use/" target="_blank" rel="noreferrer">Terms</a>)</li>
        <li><strong>Cloudflare</strong> — hosting and Workers (<a href="https://www.cloudflare.com/terms/" target="_blank" rel="noreferrer">Terms</a>)</li>
        <li><strong>Google</strong> — Maps Places API (<a href="https://policies.google.com/terms" target="_blank" rel="noreferrer">Terms</a>)</li>
      </ul>

      <h2 id="termination" className="text-xl md:text-2xl font-semibold">12. Termination</h2>
      <p>
        <strong>By you:</strong> you may delete your account at any time from
        Settings → Data and privacy → "Delete my account". This triggers a server-side cascade
        that removes every recipe, event, menu, and allergen-audit row tied to your account from
        our database, unpublishes any recipes you shared to the community library, clears the
        demo-provisioning marker, and deletes your Clerk authentication credentials. The post-
        delete reload also clears the on-device IndexedDB cache. The operation is irreversible.
      </p>
      <p>
        <strong>By us:</strong> we may suspend or terminate your account if you breach these Terms,
        engage in conduct harmful to other users or ChefFlow, or (for Pro accounts) fail to pay
        subscription fees after a grace period. Where practical, we will notify you before
        suspension and give you an opportunity to remedy the issue. In serious cases (e.g.,
        distributing harmful content) we may act immediately without prior notice.
      </p>
      <p>
        On termination by either party, the licences granted in these Terms end immediately, except
        for community recipes already copied by other users into their local libraries (which cannot
        be recalled remotely).
      </p>

      <h2 id="liability" className="text-xl md:text-2xl font-semibold">13. Limitation of liability</h2>
      <p>
        Nothing in these Terms limits or excludes ChefFlow's liability for: death or personal injury
        caused by our negligence; fraud or fraudulent misrepresentation; or any other liability that
        cannot lawfully be limited or excluded under UK law (including under the Consumer Rights Act
        2015, where applicable).
      </p>
      <p>
        Subject to the above, to the maximum extent permitted by applicable UK law:
      </p>
      <ul>
        <li>
          ChefFlow's total aggregate liability to you in any twelve-month period, whether in
          contract, tort (including negligence), breach of statutory duty, or otherwise, is limited
          to the greater of (a) the total fees you paid to ChefFlow in that twelve-month period or
          (b) £100 (one hundred pounds sterling).
        </li>
        <li>
          ChefFlow is not liable for any indirect, consequential, incidental, or special loss,
          including loss of profit, loss of revenue, loss of data, or loss arising from reliance on
          AI-generated content or allergen information, even if we have been advised of the
          possibility of such loss.
        </li>
      </ul>
      <p>
        [REVIEW: the liability cap and exclusions must be reviewed by a UK-qualified solicitor to
        confirm they are enforceable under UCTA 1977, CRA 2015, and any other applicable statute,
        particularly given the food-safety context.]
      </p>

      <h2 id="governing-law" className="text-xl md:text-2xl font-semibold">14. Governing law and disputes</h2>
      <p>
        These Terms are governed by the law of England and Wales. [REVIEW: confirm jurisdiction
        clause — you may wish to offer alternative dispute resolution (ADR) as required under the
        Alternative Dispute Resolution for Consumer Disputes Regulations 2015 if your users include
        consumers, and confirm whether the exclusive-jurisdiction clause is appropriate given the
        CRA 2015 restrictions on jurisdiction clauses in consumer contracts.]
      </p>
      <p>
        If a dispute arises, we encourage you to contact us first at{' '}
        <a href="mailto:admin@chefflow.uk">admin@chefflow.uk</a>{' '}
        so we can try to resolve it informally.
      </p>

      <h2 id="general" className="text-xl md:text-2xl font-semibold">15. General</h2>
      <ul>
        <li>
          <strong>Severability:</strong> if any provision of these Terms is found to be
          unenforceable, the remaining provisions continue in full force.
        </li>
        <li>
          <strong>No waiver:</strong> failure to enforce any provision of these Terms is not a
          waiver of our right to enforce it later.
        </li>
        <li>
          <strong>Entire agreement:</strong> these Terms, together with the Privacy Policy,
          Disclaimer, and Cookie Policy, form the entire agreement between you and ChefFlow
          regarding the service and supersede any prior agreements.
        </li>
        <li>
          <strong>Contact:</strong>{' '}
          <a href="mailto:admin@chefflow.uk">admin@chefflow.uk</a>.
        </li>
      </ul>

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

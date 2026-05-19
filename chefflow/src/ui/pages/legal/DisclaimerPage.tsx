import LegalLayout from './LegalLayout';

export default function DisclaimerPage() {
  return (
    <LegalLayout title="Disclaimer" lastUpdated="2026-05-19">
      <p>
        ChefFlow is a productivity tool for professional kitchens. The following limitations apply
        to everything the platform produces.
      </p>

      <h2>Cooking guidance is informational only</h2>
      <p>
        Content generated or surfaced by ChefFlow — including recipes, cooking times, temperatures,
        and techniques — is informational only. It is not a substitute for professional chef
        training, food hygiene qualifications (such as a Level 2 or Level 3 Food Safety Award), or
        the judgment of a competent, qualified chef. Never follow generated guidance without
        applying your own professional knowledge and the standards required by your local
        environmental health authority.
      </p>

      <h2>Allergen warnings are estimates, not certified analysis</h2>
      <p>
        ChefFlow's allergen detection is LLM-estimated and informational. The platform maps
        ingredients against the UK-14 controlled allergen list as a heuristic only. This is{' '}
        <strong>not</strong> a certified allergen analysis and does not satisfy the allergen
        information requirements of UK Food Information Regulations (FIR 2014) or Natasha's Law.
        Always verify allergens against your own sourcing before serving. The platform is a tool —
        operational food-safety responsibility remains with the regulated food business.
      </p>
      <p>
        Before serving any dish to the public, verify allergen content directly with your ingredient
        suppliers and, where required, consult a qualified allergen advisor.
      </p>

      <h2>AI-generated workflows may contain errors</h2>
      <p>
        Kitchen workflows produced by the AI assistant may contain mistakes in timing, temperature,
        sequencing, or food-safety practice. All generated workflows must be reviewed and approved
        by a competent senior team member before use in a live kitchen. Do not treat a generated
        workflow as a validated Standard Operating Procedure (SOP) without that review.
      </p>

      <h2>Professional kitchen safety is your responsibility</h2>
      <p>
        ChefFlow does not account for your specific kitchen layout, equipment specifications,
        team competency, or the regulatory requirements applicable to your business. Nothing in
        ChefFlow constitutes advice on HACCP, fire safety, manual handling, or any other
        operational food-business obligation. You bear full and exclusive responsibility for safe
        kitchen operation, compliance with health and safety law, and the welfare of your team and
        customers.
      </p>

      <p><em>This document is a plain-English summary, not legal advice. Have a UK-qualified solicitor review before public launch.</em></p>
    </LegalLayout>
  );
}

# ChefFlow — UK Regulatory Compliance Roadmap

> Scope: regulatory obligations beyond T&C / privacy policy / cookies / disclaimer, which are covered separately.
> Current date: 2026-05-18. Entity type and VAT registration status assumed unknown — flagged where relevant.

---

## Compliance Matrix

| Regulation | What it requires | Current status | Priority | Likely owner |
|---|---|---|---|---|
| **UK GDPR / DPA 2018 — ICO registration** | Most data controllers must register with the ICO and pay the annual fee (Tier 1: £40/yr for small orgs, Tier 2: £60, Tier 3: £2,900). Sole traders processing only for their own business may be exempt; any SaaS charging users almost certainly is not. | Not confirmed | **P0** | Operations |
| **UK GDPR — Lawful basis documentation** | Each processing activity must have a documented lawful basis (contract, legitimate interest, consent, etc.) recorded in a Record of Processing Activities (RoPA). | Not started | **P0** | Legal |
| **UK GDPR — DPAs with sub-processors** | Written Data Processing Agreements required with every sub-processor handling personal data on your behalf: Clerk (auth/PII), Groq (prompts may contain PII), Cloudflare (logs/KV), Google (Maps API calls). | Not started | **P0** | Legal / Engineer |
| **UK GDPR — DPO requirement** | Required only if core activities involve large-scale systematic monitoring or special-category data. ChefFlow at current scale is unlikely to require a formal DPO. [!] Reassess if processing staff health/allergen data for employees at scale. | Not applicable (current scale) | P2 | Legal |
| **UK GDPR — International transfers (Groq)** | Groq is US-based. Post-Brexit, transfers to the US require an appropriate safeguard: adequacy decision (US does not have one with the UK [!] — verify current UK-US data bridge status as of 2026), SCCs (UK IDTAs), or binding corporate rules. | Likely non-compliant | **P0** | Legal / Engineer |
| **Food Information Regulations 2014 / Natasha's Law 2021 — allergen labelling** | FIR 2014 covers allergen disclosure for non-pre-packed food served directly to consumers. Natasha's Law (Oct 2021) extends mandatory full ingredient + allergen labelling to PPDS (pre-packed for direct sale). These obligations fall on the **food business operator (FBO)**, not on software tools. ChefFlow surfaces the UK-14 allergen taxonomy as a B2B productivity aid; it does not itself label food for consumers. The app is not regulated as a food labelling system. However: if output is exported or printed and physically attached to food, the FBO carries the compliance burden — ChefFlow should disclaim this clearly. | Not applicable to ChefFlow directly; user FBOs carry obligation | P1 | Legal (disclaimer copy) |
| **FSA nutritional claims (Regulation (EC) 1924/2006, retained in UK law)** | Specific health or nutrition claims on food labels require authorisation. ChefFlow's LLM-generated nutritional estimates are not regulated claims — they are internal planning tools. However, if the app presents claims that users could reproduce on consumer-facing packaging, a disclaimer is essential. | Marginally applicable — disclaimer needed | P1 | Legal / Engineer |
| **Equality Act 2010 / WCAG 2.2 AA** | Equality Act requires reasonable adjustments for disabled users. WCAG 2.2 AA is the recognised technical standard. The Public Sector Bodies Accessibility Regulations (PSBAR) do NOT apply (ChefFlow is private sector). However, the Equality Act duty to make reasonable adjustments applies to any business providing a service to the public, including professional SaaS. Core requirements: keyboard navigation, sufficient colour contrast, screen reader compatibility, accessible forms. | Unknown — no audit done | P1 | Engineer |
| **Consumer Contracts Regulations 2013** | Requires pre-contract information (pricing, cancellation rights, 14-day cooling-off period) for distance contracts with consumers. **Trigger: ChefFlow begins charging users.** Currently free — not applicable. When pricing launches, required disclosures must appear before payment. | Not applicable (currently free) | P2 — triggered by monetisation | Legal |
| **PECR — transactional / marketing email** | Cookies are out of scope (covered separately). PECR also governs unsolicited electronic marketing: requires opt-in consent before sending marketing emails to individuals. Transactional emails (receipts, alerts) are permitted without consent. If ChefFlow sends any product updates or newsletters, a PECR-compliant opt-in mechanism is required. | Unknown — depends on email strategy | P1 | Engineer / Operations |
| **Companies Act 2006 — record-keeping** | Applies to UK Ltd companies and LLPs: statutory registers, annual confirmation statement, accounts filing at Companies House. **Trigger: entity is incorporated as UK Ltd/LLP.** Not applicable to sole traders or non-UK entities beyond standard tax obligations. | Out of scope unless entity is UK Ltd | P2 | Operations |
| **UK VAT — digital services** | VAT registration threshold: £90,000 taxable turnover in a 12-month rolling period (2026 figure — confirm with HMRC [!]). For B2B digital services sold cross-border within the UK, standard VAT rules apply once registered. The EU MOSS regime no longer applies post-Brexit; UK businesses selling to EU consumers use the EU OSS scheme. If ChefFlow charges EU consumers directly, EU VAT obligations may also arise. Currently free — not applicable. | Not applicable (currently free) | P2 — triggered by monetisation | Operations / Legal |

---

## Out of Scope

- **T&C / privacy policy / cookies / disclaimer pages** — covered by the separate legal-pages plan.
- **Food hygiene ratings / FSA business registration** — applies to physical food premises, not SaaS tools.
- **Licence to operate as a food business** — applies to FBOs using ChefFlow, not to ChefFlow itself.
- **Employment law / IR35** — no employee/contractor data is being processed by the app.
- **PCI-DSS** — ChefFlow does not currently handle card data; Stripe or equivalent would own this on monetisation.

---

## Sequencing Recommendation

### Must land before public launch (P0)

1. **ICO registration** — Operating as an unregistered data controller is a criminal offence. File and pay the fee (likely £40–£60) before any public URL is promoted. One-day task.
2. **RoPA + lawful basis documentation** — Required under UK GDPR Article 30. Grounds the rest of your compliance posture. Without it, every other obligation floats.
3. **DPAs with Clerk, Groq, Cloudflare, Google** — Sub-processor agreements are a prerequisite for lawful processing. Clerk and Cloudflare publish standard DPAs; Groq's and Google's require review. **Groq is the highest-risk gap**: US-based, no UK adequacy decision confirmed, and prompts may carry user PII.
4. **Groq international transfer mechanism** — If the UK-US data bridge [!] is not in force or does not cover Groq's use case, a UK IDTA (addendum to SCCs) must be executed before live user data flows to Groq.

### Post-launch, within 90 days (P1)

5. **Allergen / FSA disclaimer copy** — Low-effort legal copy clarifying ChefFlow is a B2B planning tool and that FBOs carry labelling obligations. Prevents user misunderstanding before it becomes a claim.
6. **PECR email opt-in** — Before any marketing email is sent, a compliant opt-in must exist. If the product only sends transactional email today, this can land at the point the first marketing campaign is planned.
7. **WCAG 2.2 AA audit** — Not a hard legal blocker pre-launch for a private SaaS, but the Equality Act duty applies from day one. A lightweight automated audit (Axe, Lighthouse) surfaces quick wins.

### Deferred (P2 — trigger-based)

8. **Consumer Contracts Regulations** — Activate when pricing launches.
9. **VAT / OSS registration** — Activate when revenue exceeds £90,000 threshold or EU consumers are billed.
10. **Companies Act** — Activate if entity incorporates as UK Ltd.
11. **DPO appointment** — Reassess if user base scales to large-scale systematic processing.

---

> [!] Flagged uncertainties: (a) UK-US data adequacy bridge status as of 2026 — verify at ico.org.uk before relying on it for Groq transfers. (b) UK VAT threshold — £90,000 is correct as of April 2024; confirm no upward revision has occurred. (c) DPO threshold language is from UK GDPR Article 37 — applies to "large scale" processing of special-category data; "large scale" is not numerically defined and requires case-by-case judgment.

# UK Limited company incorporation — ChefFlow checklist

Goal: register ChefFlow as a UK private limited company so the
founder's personal assets are shielded from any claim against the
business. £12 incorporation fee, ~24 hours online, plus
~£13/year ongoing for the annual confirmation statement.

This is a checklist, not a manual — assume you already know what a
limited company is. Cross-references to the official guidance:
https://www.gov.uk/limited-company-formation

---

## Decisions to make BEFORE you start

### 1. Company name

- Check availability: https://find-and-update.company-information.service.gov.uk/
- Avoid names too close to existing companies (Companies House will
  reject). Try variations: `Chefflow Ltd`, `ChefFlow Software Ltd`,
  `ChefFlow UK Ltd`.
- Some words are restricted (e.g. "Royal", "British", "Group") — see
  https://www.gov.uk/government/publications/incorporation-and-names

### 2. Registered office address

This is PUBLIC — anyone can search it on Companies House. Choices:

| Option | Cost | Privacy | Notes |
|---|---|---|---|
| Your home address | Free | None — your address is public forever | Most common but loses you privacy permanently |
| Registered-office service | £30–£100/yr | Service receives mail, forwards to you | Recommended. Try `Hoxton Mix`, `Made Simple`, `1st Formations` |
| Accountant's address | Often free with services | Good | Only if you've engaged one |

**Recommendation:** Use a registered-office service. £40-£60/yr is a small
price to keep your home address off the public register forever. You can
change later but the change is itself public.

### 3. SIC code (industry classification)

Pick 1–4. ChefFlow fits:

- **62012** — Business and domestic software development *(primary —
  use this one)*
- **62020** — Information technology consultancy activities *(if you
  also do consulting)*
- **63990** — Other information service activities n.e.c. *(catch-all
  if asked)*

Full list: https://www.gov.uk/government/publications/standard-industrial-classification-of-economic-activities-sic

### 4. Director(s)

- You're the director.
- Need: full name, date of birth, nationality, occupation
  ("Software developer" or "Founder"), residential address (NOT
  public — held confidentially by Companies House) and service
  address (CAN be the registered-office service from §2 above).

### 5. Shareholder(s) + share structure

For a solo founder, simplest setup:

- One shareholder (you).
- 100 ordinary shares at £0.01 each = £1.00 nominal share capital.
- One share class.

If you might bring on a co-founder / investor later, that's a
restructure problem — don't over-engineer now.

### 6. People with Significant Control (PSC)

- For a solo founder with 100% shares: that's you. Tick the "owns
  more than 75% of the shares" + "owns more than 75% of the voting
  rights" boxes.

### 7. Memorandum + Articles of Association

Use the **model articles** for private companies limited by shares
(default option in the online form). Don't write custom articles
unless instructed by a solicitor.

---

## Incorporation steps

### Online (recommended)

1. Go to https://www.gov.uk/limited-company-formation
2. Click "Set up a limited company" → "Register online"
3. Fill in:
   - Company name
   - Registered office address (from §2)
   - SIC codes (§3 — start with 62012)
   - Director details (§4)
   - Shareholder details (§5)
   - PSC declaration (§6)
   - Memorandum + model articles (§7 — default selection)
4. Pay £12 (debit card).
5. Companies House emails the **Certificate of Incorporation** + your
   **Company Number** + your **UTR** (Unique Taxpayer Reference)
   usually within 24 hours, sometimes minutes.

### Save these immediately

Upload all three documents to a Google Drive folder on
`admin@chefflow.uk` named "ChefFlow / Legal / Incorporation":
- Certificate of Incorporation (PDF)
- Memorandum & Articles (PDF — included in the email)
- UTR letter (the HMRC one comes separately by post, ~10 days)

---

## Post-incorporation — must do within 3 months

### 1. Register for Corporation Tax with HMRC

Within **3 months of starting business activity**. Online form here:
https://www.gov.uk/limited-company-formation/set-up-your-company-for-corporation-tax

You'll need:
- Company number (from Certificate of Incorporation)
- UTR (from HMRC's letter)
- Date you started trading
- Accounting period dates (default: first accounting period ends one
  year after the last day of the month of incorporation)
- Type of activity (SaaS / software)

### 2. Open a business bank account

Personal accounts can't legally receive business income for a
limited company. Options:

| Bank | Account opening time | Monthly fee | Best for |
|---|---|---|---|
| **Tide** (current Stripe payout target) | ~10 min, fully online | £0 (Free plan) | Already integrated — just keep it but switch from sole-trader to limited-company variant |
| Monzo Business | ~24h | £5/mo Pro | Best app UX |
| Starling Business | ~24h | £0 (Free) | Best all-rounder for SaaS |
| Mettle (NatWest) | ~24h | £0 | Strict on KYC but free |

**Recommendation:** Stick with Tide (since Stripe payouts already go
there) but switch from the sole-trader account variant to the
limited-company variant — Tide has a "convert account" flow that's
~10 min, and Stripe payout details stay the same.

You'll need to upload to whatever bank you choose:
- Certificate of Incorporation
- Director ID (passport or driving licence)
- Proof of director's residential address (utility bill < 3 months
  old)

### 3. Set up business records

Statutory registers required by law:
- Register of members (shareholders)
- Register of directors
- Register of PSCs
- Register of directors' residential addresses

You can keep these on paper, in Notion, or in a free service like
Inform Direct (https://www.informdirect.co.uk/) — they auto-prefill
from your Companies House data and remind you when to file the
annual confirmation statement.

### 4. Update third-party services to the limited-company identity

After bank account is open and ID-verified:

- [ ] **Stripe** — update the connected account from "Individual /
      Sole Trader" to "Company / UK Limited". Stripe will ask for
      Companies House number + Certificate. May briefly pause
      payouts during re-KYC.
- [ ] **Clerk** — change billing entity on the Clerk account
      (Settings → Billing → Tax information).
- [ ] **Cloudflare** — change billing entity (Account → Members →
      Update Billing Information).
- [ ] **Google Workspace** — change billing payer to the company
      (Admin → Billing → Payment accounts). Update the invoice
      details so VAT can be reclaimed once you register.
- [ ] **Resend** — update payment account billing details.
- [ ] **Groq** — update billing if and when you're on a paid plan.

### 5. (Maybe) Register for VAT

You MUST register for VAT once turnover in any 12-month period
exceeds **£90,000** (threshold as at 1 April 2024 — check
gov.uk/vat-registration-thresholds for the current number).

Before that threshold, voluntary registration is allowed and lets
you reclaim VAT on inputs (Cloudflare, Stripe fees, Resend, etc.) —
worth it if your input VAT is meaningful and your customers are
mostly other businesses (who can themselves reclaim).

For a solo SaaS at MVP / pre-revenue stage: usually NOT worth the
admin burden until you're approaching the threshold.

### 6. Annual obligations

Set calendar reminders:

| Filing | Frequency | Cost | Filed where |
|---|---|---|---|
| Confirmation Statement | Annually | £34 if filed online | Companies House |
| Annual accounts | Annually (small co. — abridged) | Free (or via accountant ~£300–£800) | Companies House |
| Corporation Tax return (CT600) | Annually | Free (or via accountant) | HMRC |

Small dormant or single-director companies can usually self-file all
three; once you're earning, an accountant pays for themselves.

---

## Estimated total cost — year one

| Item | Cost |
|---|---|
| Companies House incorporation | £12 |
| Registered-office service | £50–£100 |
| Confirmation Statement | £34 |
| Accountant (optional but recommended once trading) | £300–£800 |
| **Total year 1** | **£100 (DIY) to ~£950 (with accountant)** |

Year 2+ runs ~£40 + accountant fees.

---

## Quick win — do today, takes 20 minutes

1. Search the name on Companies House to confirm availability.
2. Decide on a registered-office service (Hoxton Mix is the
   default-good choice at £40/yr).
3. Bookmark `https://www.gov.uk/limited-company-formation` for when
   you've got 30 uninterrupted minutes to incorporate.

The solicitor work (other deliverable) can run in parallel — they're
independent.

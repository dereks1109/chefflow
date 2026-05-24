import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Check,
  ChefHat,
  Crown,
  Hotel,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  WifiOff,
} from 'lucide-react';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { TIER_LIMITS, TIER_PRICE_GBP } from '../../core/tier/limits';

const SUPPORT_EMAIL = 'dereks1109@gmail.com';

export default function AboutPage() {
  const openUpgrade = useUpgradeSheetStore((s) => s.openWith);
  const location = useLocation();

  // Scroll the section into view when hashed (e.g. /about#pricing).
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  return (
    <section className="p-4 md:p-6 max-w-4xl mx-auto space-y-12">
      {/* ───── HERO ───── */}
      <header className="text-center pt-4">
        <p className="text-xs uppercase tracking-widest text-accent font-semibold">
          ChefFlow · UK
        </p>
        <h1 className="mt-2 text-3xl md:text-5xl font-bold tracking-tight">
          Plan. Prep. Serve.
          <br className="hidden md:block" />
          <span className="text-slate-500 dark:text-slate-400">Without losing your evening.</span>
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-sm md:text-base text-slate-600 dark:text-slate-300">
          ChefFlow is the kitchen-grade planning tool for private chefs, small bistros, and large
          banquet kitchens. Reliable offline. AI assists where it should. Audits everything it
          touches — including the parts that protect your guests.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          <Link to="/recipes" className="btn-primary inline-flex items-center gap-2">
            Open the kitchen
          </Link>
          <a href="#pricing" className="btn-secondary">See pricing</a>
        </div>
      </header>

      {/* ───── BUILT FOR ───── */}
      <section aria-labelledby="about-built-for-heading">
        <h2 id="about-built-for-heading" className="text-xs uppercase tracking-widest text-slate-500 font-semibold text-center">
          Built for
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <AudienceCard
            icon={ChefHat}
            heading="Private chefs + supper clubs"
            body="Solo operators running 6–30 covers. AI drafts a recipe, scales portions, and lays out the prep schedule so you stop juggling sticky notes."
            tier="Pro"
            tone="accent"
          />
          <AudienceCard
            icon={Users}
            heading="Small bistros"
            body="One- to three-chef kitchens. Per-chef workflow colours, station audit trails, printable PDF checklists for the line."
            tier="Pro"
            tone="accent"
          />
          <AudienceCard
            icon={Hotel}
            heading="Hotels + large banquets"
            body="Back-of-house teams up to 50 seats. No AI caps, priority support, and the same allergen audit log that holds up if a diner reacts."
            tier="Enterprise"
            tone="amber"
          />
        </div>
      </section>

      {/* ───── THREE SELLING POINTS ───── */}
      <section aria-labelledby="about-selling-points-heading" className="space-y-8">
        <h2 id="about-selling-points-heading" className="text-xs uppercase tracking-widest text-slate-500 font-semibold text-center">
          Why teams pay for it
        </h2>

        <SellingPoint
          icon={WifiOff}
          heading="Kitchen-grade reliability"
          tagline="Built to keep working when your wifi doesn't."
          bullets={[
            'Local-first — recipes load instantly, even on a flaky kitchen connection.',
            'Cross-device sync (Cloudflare D1) means your laptop draft is on your phone before service.',
            'Clear browser cache by accident? Your library is still there next time you sign in.',
          ]}
        />

        <SellingPoint
          icon={ShieldCheck}
          heading="AI co-chef that respects allergens"
          tagline="The AI helps. The audit log covers your back."
          bullets={[
            'Draft a recipe, generate a menu description, or schedule a multi-dish service in seconds.',
            'Every UK-14 allergen is auto-flagged from ingredient names; chefs see them on every recipe card.',
            'Removing an allergen tag triggers a two-step modal + 5-second cooldown, and the reason lands in a tamper-resistant audit log. That log is your evidence if a diner ever asks.',
          ]}
        />

        <SellingPoint
          icon={Timer}
          heading="Workflow scheduler that prevents collisions"
          tagline="LLM + culinary rules merge multi-dish events into one timeline."
          bullets={[
            'Plans timing across every dish in an event — flash items at the end, stable braises start early.',
            'Per-chef colour coding shows who owns what; print a PDF checklist for each station.',
            'Aggregates the shopping list across all dishes, deduped by unit family and tagged by sub-recipe.',
          ]}
        />
      </section>

      {/* ───── PRICING ───── */}
      <section
        id="pricing"
        aria-labelledby="about-pricing-heading"
        className="space-y-4 scroll-mt-20"
      >
        <h2 id="about-pricing-heading" className="text-xs uppercase tracking-widest text-slate-500 font-semibold text-center">
          Pricing
        </h2>
        <p className="text-center text-sm text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
          Free covers a single small event a day. Pro removes the daily caps. Enterprise lifts every
          cap, adds 50 seats for your team, and gets priority support.
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {/* Free */}
          <PricingCard
            name="Free"
            tagline="Get to know the kitchen."
            price="£0/mo"
            tone="neutral"
            features={[
              `${TIER_LIMITS.free.maxRecipesPerDay} recipes / day`,
              `${TIER_LIMITS.free.maxEventsPerDay} event / day`,
              `${TIER_LIMITS.free.maxLlmCallsPerDay} AI calls / day`,
              'Allergen audit trail included',
            ]}
            cta={
              <Link to="/recipes" className="btn-secondary w-full justify-center inline-flex">
                Open ChefFlow
              </Link>
            }
          />
          {/* Pro */}
          <PricingCard
            name="Pro"
            tagline="Private chefs · small bistros · supper clubs"
            price={`£${TIER_PRICE_GBP.pro.monthly}/mo`}
            tone="accent"
            annualNote={`£${TIER_PRICE_GBP.pro.annual}/yr (save 25%)`}
            features={[
              'Unlimited recipes + events',
              `${TIER_LIMITS.pro.maxLlmCallsPerDay} AI calls / day`,
              'Cross-device sync + audit history',
              'Workflow scheduler + PDF checklists',
            ]}
            cta={
              <button
                type="button"
                onClick={() => openUpgrade('general')}
                data-testid="about-cta-pro"
                className="btn-primary w-full justify-center"
              >
                Upgrade to Pro
              </button>
            }
          />
          {/* Enterprise */}
          <PricingCard
            name="Enterprise"
            tagline="Hotels · large banquet restaurants · catering teams"
            price={`£${TIER_PRICE_GBP.enterprise.monthly}/mo`}
            tone="amber"
            annualNote={`£${TIER_PRICE_GBP.enterprise.annual}/yr (save 25%)`}
            features={[
              'Everything in Pro, plus:',
              'Unlimited AI calls — no daily cap',
              `Up to ${TIER_LIMITS.enterprise.maxSeats} chef seats`,
              'Priority email support',
            ]}
            cta={
              <button
                type="button"
                onClick={() => openUpgrade('general')}
                data-testid="about-cta-enterprise"
                className="inline-flex items-center justify-center w-full px-3 h-10 rounded-md text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Crown className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Upgrade to Enterprise
              </button>
            }
          />
        </div>
      </section>

      {/* ───── TRUST + CONTACT ───── */}
      <section
        aria-labelledby="about-trust-heading"
        className="rounded-lg border border-slate-200 dark:border-slate-700 p-5 bg-white dark:bg-kitchen-ink"
      >
        <h2 id="about-trust-heading" className="text-sm font-semibold inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          A note on trust
        </h2>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          ChefFlow doesn't sell your data. Allergen audits are recorded per-device unless you sign in
          (in which case they sync to your own cloud account on Cloudflare). Recipes never leave your
          account. If you cancel, your library stays browsable offline until you clear browser data.
        </p>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
          Questions, bug reports, feature requests:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:underline">{SUPPORT_EMAIL}</a>{' '}
          · or use <Link to="/contact" className="text-accent hover:underline">the contact form</Link>.
        </p>
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — kept tiny so the body above stays scannable.
// ---------------------------------------------------------------------------

interface AudienceCardProps {
  icon: typeof ChefHat;
  heading: string;
  body: string;
  tier: 'Pro' | 'Enterprise';
  tone: 'accent' | 'amber';
}

function AudienceCard({ icon: Icon, heading, body, tier, tone }: AudienceCardProps) {
  const chip =
    tone === 'amber'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : 'bg-accent/15 text-accent';
  return (
    <article className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-4 flex flex-col">
      <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
      <h3 className="mt-2 font-semibold text-sm">{heading}</h3>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 flex-1">{body}</p>
      <span className={`mt-3 inline-flex items-center self-start gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${chip}`}>
        {tier}
      </span>
    </article>
  );
}

interface SellingPointProps {
  icon: typeof Sparkles;
  heading: string;
  tagline: string;
  bullets: string[];
}

function SellingPoint({ icon: Icon, heading, tagline, bullets }: SellingPointProps) {
  return (
    <article className="grid md:grid-cols-[1fr_2fr] gap-4 md:gap-6 items-start">
      <header>
        <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
        <h3 className="mt-2 text-xl font-bold">{heading}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{tagline}</p>
      </header>
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <Check className="h-4 w-4 mt-0.5 text-accent shrink-0" aria-hidden="true" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

interface PricingCardProps {
  name: string;
  tagline: string;
  price: string;
  annualNote?: string;
  features: string[];
  tone: 'neutral' | 'accent' | 'amber';
  cta: React.ReactNode;
}

function PricingCard({ name, tagline, price, annualNote, features, tone, cta }: PricingCardProps) {
  const border =
    tone === 'accent'
      ? 'border-accent/50 bg-accent/5 dark:bg-accent/10'
      : tone === 'amber'
      ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-900/10'
      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink';
  return (
    <article className={`rounded-lg border p-4 flex flex-col ${border}`}>
      <header>
        <h3 className="font-semibold">{name}</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">{tagline}</p>
      </header>
      <p className="mt-2 text-2xl font-bold">{price}</p>
      {annualNote && <p className="text-[11px] text-slate-500">{annualNote}</p>}
      <ul className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 flex-1">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
      <div className="mt-4">{cta}</div>
    </article>
  );
}

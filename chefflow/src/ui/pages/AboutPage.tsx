import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Check,
  ChefHat,
  ClipboardCheck,
  Crown,
  Hotel,
  Sparkles,
  Timer,
  Users,
  WifiOff,
} from 'lucide-react';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';
import { TIER_LIMITS, TIER_PRICE_GBP } from '../../core/tier/limits';

const SUPPORT_EMAIL = 'admin@chefflow.uk';

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
          <span className="text-slate-500 dark:text-slate-400">Hours back in your day.</span>
        </h1>
        <p className="mt-4 max-w-2xl mx-auto text-sm md:text-base text-slate-600 dark:text-slate-300">
          ChefFlow is a productivity tool for working chefs. It cuts the planning
          time on a six-course event from 90 minutes to under 10, batches your
          prep across dishes, and lays out a chef-by-chef timeline that keeps
          two cooks off the same burner. Built to keep running when the wifi
          doesn't.
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
            body="Solo operators running 6–30 covers. Turn a same-day client brief into a costed menu and a reverse-engineered prep schedule in minutes — not the hour you used to spend with a notebook."
            tier="Pro"
            tone="accent"
          />
          <AudienceCard
            icon={Users}
            heading="Small bistros"
            body="One- to three-chef kitchens. Per-chef colour coding shows who owns what, the scheduler keeps a junior and a sous off the same pan, and you can print a station-by-station checklist before service."
            tier="Pro"
            tone="accent"
          />
          <AudienceCard
            icon={Hotel}
            heading="Hotels + large banquets"
            body="Back-of-house teams up to 50 seats. Run multiple events through the same scheduler, watch oven contention before it happens, and audit who did what after the night's over."
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
            'Install to the home screen and the app boots offline once cached. Service goes on if the router dies.',
            'Cross-device sync (Cloudflare D1) means your laptop draft is on your phone before service.',
            'Clear browser cache by accident? Your library is still there next time you sign in.',
          ]}
        />

        <SellingPoint
          icon={ClipboardCheck}
          heading="Audited every step"
          tagline="A paper trail your team and your insurance both want."
          bullets={[
            "Every chef sees the same per-step status — who's prepped what, who's plating, what's left.",
            'Allergens are chef-declared (not AI-guessed) — you remain the food business operator under FIR 2014, and ChefFlow stores your declaration verbatim.',
            'Removing an allergen tag asks for a reason and records it in a tamper-resistant log; the log syncs to your account so a manager can review it after the event.',
            'Publish a recipe to the community library and ChefFlow asks you to attest your allergen list is complete — the attestation is logged too.',
          ]}
        />

        <SellingPoint
          icon={Timer}
          heading="Scheduler that prevents collisions"
          tagline="Multi-dish events get a single coordinated timeline."
          bullets={[
            'Plans timing across every dish in an event — flash items hit the pass last, braises start early, the LLM cites the 10 culinary rules it applied on each step.',
            'Chef Team Parallelism (Rule 7): two chefs with different colour tags run in parallel; bottlenecks get flagged with "consider reassigning dish X to chef Y".',
            'Equipment Scheduling (Rule 8): the scheduler tracks shared oven slots + burners and shifts the second-in-line with a clear "delayed N min — oven contention" warning.',
            'Plating & Service Window (Rule 9): the last 3 minutes before serve are reserved for plating, with a single "FIRE — plating begins" milestone so courses walk out together.',
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
          ChefFlow doesn't sell your data. Allergens are user-declared and never
          inferred by ChefFlow's AI; you stay the food business operator. The
          audit trail records what your kitchen did, not what the model
          guessed. Recipes never leave your account; if you cancel, your
          library stays browsable offline until you clear browser data.
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

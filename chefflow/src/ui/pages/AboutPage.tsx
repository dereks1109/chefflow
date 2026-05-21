import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Sparkles,
  BookOpen,
  CalendarDays,
  ChefHat,
  Users,
  Globe2,
  Zap,
  Clock,
  Check,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import { useUpgradeSheetStore } from '../../state/useUpgradeSheetStore';

const builtFor = [
  {
    icon: Users,
    heading: 'Private Chefs',
    body: 'Managing solo gigs or running micro-teams.',
  },
  {
    icon: Globe2,
    heading: 'Supper Clubs',
    body: 'Hosting rotating, high-frequency seasonal menus.',
  },
  {
    icon: ChefHat,
    heading: 'Small Caterers',
    body: 'Executing complex, multi-course timed events.',
  },
];

const flowSteps = [
  {
    label: 'Recipe Library',
    description: 'AI Drafts & Scaling',
  },
  {
    label: 'Event Planning',
    description: 'Drag-and-Drop Menus',
  },
  {
    label: 'Kitchen Workflows',
    description: 'Auto-Sequenced Schedule',
  },
];

export default function AboutPage() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    // Defer past the current render tick so the section is in the DOM and laid out.
    const timer = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: 'start' });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [hash]);

  return (
    <section className="max-w-5xl mx-auto px-4 py-10 md:py-16 space-y-16">

      {/* Hero */}
      <section aria-labelledby="about-hero-heading" className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Kitchen Planning Software
          </span>
        </div>
        <h1
          id="about-hero-heading"
          className="text-3xl md:text-4xl font-bold leading-tight text-slate-900 dark:text-slate-100"
        >
          ChefFlow — Plan. Prep. Serve.
        </h1>
        <p className="text-lg font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2">
          <Zap className="h-5 w-5 text-accent shrink-0" aria-hidden="true" />
          The AI Assistant Built for Professional Kitchens.
        </p>
        <p className="text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Build your recipe library, assemble event menus, and generate sequenced prep schedules
          — all in one place, offline-first on your device.
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-500 max-w-2xl mx-auto">
          "The chaos in the kitchen stops here. Say goodbye to handwritten prep sheets and erratic ticket times. ChefFlow makes precise kitchen management effortlessly simple."
        </p>
      </section>

      {/* Built For */}
      <section aria-labelledby="built-for-heading">
        <h2
          id="built-for-heading"
          className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6"
        >
          Built For
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 list-none p-0">
          {builtFor.map(({ icon: Icon, heading, body }) => (
            <li
              key={heading}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-6 space-y-3"
            >
              <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{heading}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* What ChefFlow Does — flow diagram */}
      <section aria-labelledby="what-chefflow-does-heading">
        <h2
          id="what-chefflow-does-heading"
          className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6"
        >
          What ChefFlow Does
        </h2>
        <ol
          aria-label="ChefFlow three-step workflow"
          className="flex flex-col sm:flex-row items-center justify-center gap-2 list-none p-0"
        >
          {flowSteps.map((step, i) => (
            <li key={step.label} className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <div className="flex flex-col items-center text-center bg-slate-100 dark:bg-surface-2 rounded-full px-5 py-3 min-w-[160px]">
                <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {step.label}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {step.description}
                </span>
              </div>
              {i < flowSteps.length - 1 && (
                <>
                  <ArrowDown
                    className="h-5 w-5 text-slate-400 sm:hidden"
                    aria-hidden="true"
                  />
                  <ArrowRight
                    className="h-5 w-5 text-slate-400 hidden sm:block"
                    aria-hidden="true"
                  />
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Smart Recipe Library */}
      <section aria-labelledby="recipe-library-heading">
        <div className="flex items-center gap-3 mb-4">
          <BookOpen className="h-6 w-6 text-accent" aria-hidden="true" />
          <h2
            id="recipe-library-heading"
            className="text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            Smart Recipe Library
          </h2>
        </div>
        <ul className="space-y-4 list-none p-0">
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">AI Co-Chef: </span>
              <span className="text-slate-700 dark:text-slate-300">Draft new dishes from a brief instantly.</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Type ‘Summer Truffle Appetizer’ and let AI instantly generate your baseline recipe draft.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Smart Audit: </span>
              <span className="text-slate-700 dark:text-slate-300">"Automatically check ingredient lists for accuracy and security."</span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Instant Scaling: </span>
              <span className="text-slate-700 dark:text-slate-300">Adjust portion sizes up or down in one click.</span>
              <p className="text-xs text-slate-500 mt-0.5">
                "From a 10-guest private dinner to a 100-person catering event, scale your ingredients with split-second precision."
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* Seamless Event Planning */}
      <section aria-labelledby="event-planning-heading">
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="h-6 w-6 text-accent" aria-hidden="true" />
          <h2
            id="event-planning-heading"
            className="text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            Seamless Event Planning
          </h2>
        </div>
        <ul className="space-y-4 list-none p-0">
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Timeline Sync: </span>
              <span className="text-slate-700 dark:text-slate-300">Attach individual prep timelines to specific dishes.</span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Live Guest Counts: </span>
              <span className="text-slate-700 dark:text-slate-300">Dynamic adjustments based on party size.</span>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Drag-and-Drop: </span>
              <span className="text-slate-700 dark:text-slate-300">Reorder course service flows effortlessly.</span>
              <p className="text-xs text-slate-500 mt-0.5">
              "Swapping the mains and desserts? Just drag and drop, and your entire prep schedule updates instantly."
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* Automated Kitchen Workflows */}
      <section aria-labelledby="kitchen-workflows-heading">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-6 w-6 text-accent" aria-hidden="true" />
          <h2
            id="kitchen-workflows-heading"
            className="text-xl font-bold text-slate-900 dark:text-slate-100"
          >
            Automated Kitchen Workflows
          </h2>
        </div>
        <ul className="space-y-4 list-none p-0">
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Zero Collisions: </span>
              <span className="text-slate-700 dark:text-slate-300">Auto-generates sequenced schedules based on service time.</span>
              <p className="text-xs text-slate-500 mt-0.5">
              Fire up the grill at T-minus 3 hours, plate up at T-minus 30 minutes—your service timeline has never been clearer.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Station Grouping: </span>
              <span className="text-slate-700 dark:text-slate-300">Tasks are automatically split by kitchen station.</span>
              <p className="text-xs text-slate-500 mt-0.5">
                Hot apps, salad, and pastry prep—each station gets its own dedicated prep list.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <span className="font-semibold text-slate-900 dark:text-slate-100">Offline-First: </span>
              <span className="text-slate-700 dark:text-slate-300">Runs 100% locally so your kitchen never stops moving.</span>
              <p className="text-xs text-slate-500 mt-0.5">
                No signal in a basement kitchen? The system still runs flawlessly.
              </p>
            </div>
          </li>
        </ul>
      </section>

      {/* Simple Pricing */}
      <section id="pricing" aria-labelledby="pricing-heading">
        <h2
          id="pricing-heading"
          className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6"
        >
          Simple Pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Free Tier */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-kitchen-ink p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Free Tier</h3>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">£0</p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
              Daily allowance of AI calls, recipe creation, and event builds.
            </p>
            <Link
              to="/recipes"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100 hover:border-accent hover:text-accent transition-colors min-h-[48px]"
            >
              Start Free Now
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="rounded-xl border-2 border-accent bg-white dark:bg-kitchen-ink p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Pro Tier</h3>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                £12 <span className="text-base font-normal text-slate-500">/ mo</span>
              </p>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 flex-1">
              Billed monthly/annually. No daily caps, high-limit AI access, and priority support.
            </p>
            <button
              type="button"
              onClick={() => useUpgradeSheetStore.getState().openWith('general')}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-hover transition-colors min-h-[48px]"
            >
              Upgrade to Pro
            </button>
          </div>
        </div>
      </section>

      {/* Legal */}
      <section aria-labelledby="legal-heading">
        <h2
          id="legal-heading"
          className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6"
        >
          Legal
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/disclaimer"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors min-h-[48px]"
          >
            Disclaimer
          </Link>
          <Link
            to="/privacy"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors min-h-[48px]"
          >
            Privacy Policy
          </Link>
          <Link
            to="/terms"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-accent hover:text-accent transition-colors min-h-[48px]"
          >
            Terms &amp; Conditions
          </Link>
        </div>
      </section>

    </section>
  );
}

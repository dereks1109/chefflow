import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { ArrowLeft, BookOpen, Calendar, Clock, Edit3, ExternalLink, Hand, Layers, Mail, MapPin, Phone, Sparkles, StickyNote, User, Users, Wallet } from 'lucide-react';
import { getEvent, saveEvent } from '../../db/eventsRepo';
import { getRecipe } from '../../db/recipesRepo';
import { getPrefs } from '../../db/prefsRepo';
import { swatchClassFor } from '../components/ColorPicker';
import MenuCheckPanel from '../components/MenuCheckPanel';
import VerificationToggle from '../components/VerificationToggle';
import { formatDateTime } from '../../core/util/datetime';
import { formatGBP } from '../../core/util/money';
import { groupDishesBySections } from '../../core/events/sections';
import type { Dish, KitchenEvent, MenuAnalysis, Recipe } from '../../core/types';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'ready'; event: KitchenEvent };

export default function EventView() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Recipe lookup keyed by recipeId. Populated after the event loads so dishes
  // can be priced (recipe.pricePerPortion × dish.portions) for the per-dish
  // line + event-total summary.
  const [recipesById, setRecipesById] = useState<Map<string, Recipe>>(new Map());
  const [chefName, setChefName] = useState('');

  useEffect(() => {
    let cancelled = false;
    void getPrefs().then((prefs) => {
      if (cancelled) return;
      const fromPrefs = prefs?.displayName?.trim();
      const fromClerk = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
      setChefName(fromPrefs || fromClerk || '');
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    getEvent(id).then((event) => {
      if (cancelled) return;
      if (!event) setState({ kind: 'not-found' });
      else setState({ kind: 'ready', event });
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (state.kind !== 'ready') return;
    const ids = Array.from(
      new Set(
        state.event.dishes
          .map((d) => d.recipeId)
          .filter((rid): rid is string => Boolean(rid)),
      ),
    );
    if (ids.length === 0) {
      setRecipesById(new Map());
      return;
    }
    let cancelled = false;
    void Promise.all(ids.map((rid) => getRecipe(rid))).then((loaded) => {
      if (cancelled) return;
      const next = new Map<string, Recipe>();
      for (const r of loaded) if (r) next.set(r.id, r);
      setRecipesById(next);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.kind === 'loading') return <div className="p-6 text-slate-500">Loading…</div>;
  if (state.kind === 'not-found') {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold">Event not found.</h1>
        <Link to="/events" className="btn-secondary mt-4 inline-flex">Back to events</Link>
      </div>
    );
  }

  const e = state.event;
  const dishGroups = groupDishesBySections(e.dishes, e.sections);

  function dishPrice(dish: Dish): number | undefined {
    if (!dish.recipeId) return undefined;
    const recipe = recipesById.get(dish.recipeId);
    const perPortion = recipe?.pricePerPortion;
    if (perPortion === undefined) return undefined;
    return perPortion * dish.portions;
  }

  const eventTotal = e.dishes.reduce((sum, d) => sum + (dishPrice(d) ?? 0), 0);
  const hasAnyPrice = e.dishes.some((d) => dishPrice(d) !== undefined);

  return (
    <section className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-2">
        <Link to="/events" className="btn-secondary text-sm inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Events
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(`/events/${e.id}/edit`)}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Edit3 className="h-4 w-4" aria-hidden="true" />
            Edit
          </button>
          <Link
            to={`/workflows/${e.id}`}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Generate Workflow
          </Link>
        </div>
      </header>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-6 bg-white dark:bg-kitchen-ink">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-3xl font-bold">{e.title || 'Untitled event'}</h1>
          <VerificationToggle
            verifiedAt={e.verifiedAt}
            verifiedBy={e.verifiedBy}
            chefName={chefName}
            label="this menu"
            onChange={async (next) => {
              const updated: KitchenEvent = { ...e, ...next, updatedAt: Date.now() };
              setState({ kind: 'ready', event: updated });
              await saveEvent(updated);
            }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-400">
          <Calendar className="h-4 w-4" aria-hidden="true" />
          <span>{formatDateTime(e.serveAt)}</span>
        </div>
        {e.location && (
          <div className="mt-2 flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-accent hover:underline"
              title="Open in Google Maps"
            >
              {e.location}
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          </div>
        )}
        {(e.contactName || e.contactEmail || e.contactPhone) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 dark:text-slate-400">
            {e.contactName && (
              <span className="inline-flex items-center gap-2">
                <User className="h-4 w-4" aria-hidden="true" />
                {e.contactName}
              </span>
            )}
            {e.contactEmail && (
              <a
                href={`mailto:${e.contactEmail}`}
                className="inline-flex items-center gap-2 hover:text-accent hover:underline"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {e.contactEmail}
              </a>
            )}
            {e.contactPhone && (
              <a
                href={`tel:${e.contactPhone.replace(/[^+\d]/g, '')}`}
                className="inline-flex items-center gap-2 hover:text-accent hover:underline"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                {e.contactPhone}
              </a>
            )}
          </div>
        )}
        {e.notes && (
          <div className="mt-3 flex gap-2 text-sm text-slate-700 dark:text-slate-300">
            <StickyNote className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <p className="whitespace-pre-wrap">{e.notes}</p>
          </div>
        )}
      </div>

      <MenuCheckPanel
        event={e}
        onAnalysisChange={(menuAnalysis: MenuAnalysis) =>
          setState({ kind: 'ready', event: { ...e, menuAnalysis } })
        }
      />

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            Timeline ({e.dishes.length} dish{e.dishes.length === 1 ? '' : 'es'})
          </h2>
          {hasAnyPrice && (
            <span
              className="text-sm font-semibold inline-flex items-center gap-1 text-slate-700 dark:text-slate-300"
              title="Sum of priced dishes (price/portion × portions)"
            >
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              Total {formatGBP(eventTotal)}
            </span>
          )}
        </div>
        {dishGroups.length === 0 ? (
          <p className="text-sm text-slate-500 italic">No dishes added.</p>
        ) : (
          <div className="space-y-5">
            {dishGroups.map((group) => (
              <section key={group.sectionId ?? 'unassigned'}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {group.label}
                </h3>
                <ol className="space-y-3">
                  {group.dishes.map((d) => (
                    <TimelineRow key={d.id} dish={d} price={dishPrice(d)} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TimelineRow({ dish, price }: { dish: Dish; price?: number }) {
  return (
    <li className="flex gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-kitchen-ink">
      <div className="w-28 shrink-0 text-sm text-slate-600 dark:text-slate-400 font-mono">
        {formatDateTime(dish.startAt).split(',').slice(-1)[0].trim()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {dish.colorTag && (
            <span
              className={`h-3 w-3 rounded-full shrink-0 ${swatchClassFor(dish.colorTag)}`}
              aria-label={`Color tag: ${dish.colorTag}`}
              title={`Color tag: ${dish.colorTag}`}
            />
          )}
          <h3 className="font-semibold">{dish.name || 'Untitled dish'}</h3>
          {dish.recipeId && (
            <Link
              to={`/recipes/${dish.recipeId}/edit`}
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              recipe
            </Link>
          )}
          {dish.isPrepared && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Hand className="h-3 w-3" aria-hidden="true" />
              ready
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {dish.portions} portion{dish.portions === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatDateTime(dish.startAt)}
          </span>
          {price !== undefined && (
            <span
              className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300"
              title="Portions × price per portion"
            >
              <Wallet className="h-3 w-3" aria-hidden="true" />
              {formatGBP(price)}
            </span>
          )}
        </div>
        {dish.notes && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {dish.notes}
          </p>
        )}
      </div>
    </li>
  );
}

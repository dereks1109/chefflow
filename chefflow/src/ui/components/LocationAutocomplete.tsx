import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMapsPlaces } from '../../core/util/googleMapsLoader';

// ---------------------------------------------------------------------------
// Minimal types for the NEW Places API (`AutocompleteSuggestion`).
//
// The legacy `AutocompleteService` is no longer offered to new GCP customers
// (post-March-2025 deprecation gate). New customers must use Places API (New),
// which exposes `google.maps.places.AutocompleteSuggestion`. We keep types
// inline to avoid depending on `@types/google.maps`.
// ---------------------------------------------------------------------------

interface FormattableText {
  toString(): string;
}

interface PlacePrediction {
  text: FormattableText;
  placeId: string;
}

interface AutocompleteSuggestionItem {
  placePrediction: PlacePrediction | null;
}

interface AutocompleteSuggestionStatic {
  fetchAutocompleteSuggestions(request: {
    input: string;
    sessionToken?: object;
  }): Promise<{ suggestions: AutocompleteSuggestionItem[] }>;
}

interface AutocompleteSessionTokenCtor {
  new (): object;
}

interface PlacesNamespace {
  AutocompleteSuggestion?: AutocompleteSuggestionStatic;
  AutocompleteSessionToken?: AutocompleteSessionTokenCtor;
}

interface PlacesWindow {
  google?: {
    maps?: {
      places?: PlacesNamespace;
      importLibrary?: (name: string) => Promise<PlacesNamespace>;
    };
  };
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

interface Prediction {
  description: string;
  placeId: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: Props) {
  const apiKey = ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '').trim();
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const placesRef = useRef<PlacesNamespace | null>(null);
  const sessionTokenRef = useRef<object | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Google fires `gm_authFailure` globally on bad key / referrer / disabled
  // API. The script load itself still succeeds, so this is the only signal.
  useEffect(() => {
    const winRec = window as unknown as Record<string, unknown>;
    winRec.gm_authFailure = () => {
      setLoadError(
        'Google Maps rejected the API key. Check Cloud Console: Places API (New) enabled? Referrer restriction includes this origin?',
      );
    };
    return () => {
      delete winRec.gm_authFailure;
    };
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    void loadGoogleMapsPlaces(apiKey)
      .then(async () => {
        const w = window as unknown as PlacesWindow;
        let places = w.google?.maps?.places;
        // Older script builds expose Place classes only after explicit
        // importLibrary. Try direct access first, fall back to importLibrary.
        if (!places?.AutocompleteSuggestion && w.google?.maps?.importLibrary) {
          places = await w.google.maps.importLibrary('places');
        }
        if (!places?.AutocompleteSuggestion || !places.AutocompleteSessionToken) {
          setLoadError(
            'AutocompleteSuggestion missing — enable "Places API (New)" in Google Cloud Console.',
          );
          return;
        }
        placesRef.current = places;
        sessionTokenRef.current = new places.AutocompleteSessionToken();
        setReady(true);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [apiKey]);

  // Debounced suggestion fetch.
  useEffect(() => {
    const places = placesRef.current;
    if (!ready || !places?.AutocompleteSuggestion) return;
    const query = value.trim();
    if (query.length < 2) {
      setPredictions([]);
      setFetchError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { suggestions } = await places.AutocompleteSuggestion!.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current ?? undefined,
        });
        if (cancelled) return;
        const preds: Prediction[] = [];
        for (const s of suggestions) {
          if (!s.placePrediction) continue;
          preds.push({
            description: s.placePrediction.text.toString(),
            placeId: s.placePrediction.placeId,
          });
        }
        setPredictions(preds.slice(0, 6));
        setFetchError(null);
      } catch (err) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : String(err));
        setPredictions([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, ready]);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function pick(p: Prediction) {
    onChange(p.description);
    setOpen(false);
    setPredictions([]);
    // Mint a fresh session token — the previous one is consumed on pick.
    const places = placesRef.current;
    if (places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }
  }

  const showDropdown = open && predictions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="input w-full"
        placeholder={placeholder}
        aria-label={ariaLabel ?? 'Location'}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        autoComplete="off"
      />
      {!apiKey && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Suggestions disabled — set <code>VITE_GOOGLE_MAPS_API_KEY</code> in
          your env to enable Google Places autocomplete.
        </p>
      )}
      {apiKey && !ready && !loadError && (
        <p className="mt-1 text-xs text-slate-500">Loading Google Places…</p>
      )}
      {loadError && (
        <p className="mt-1 text-xs text-red-700 dark:text-red-300">
          Couldn't load Google Maps: {loadError}
        </p>
      )}
      {fetchError && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
          Places error: {fetchError}
        </p>
      )}
      {showDropdown && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md
                     border border-slate-200 dark:border-slate-700
                     bg-white dark:bg-kitchen-ink shadow-lg"
        >
          {predictions.map((p) => (
            <li key={p.placeId} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => pick(p)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100
                           dark:hover:bg-slate-800 flex items-start gap-2"
              >
                <MapPin
                  className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <span>{p.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { loadGoogleMapsPlaces } from '../../core/util/googleMapsLoader';

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
  const [placesAvailable, setPlacesAvailable] = useState(false);
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const placesRef = useRef<PlacesNamespace | null>(null);
  const sessionTokenRef = useRef<object | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const winRec = window as unknown as Record<string, unknown>;
    winRec.gm_authFailure = () => {
      setPlacesAvailable(false);
    };
    return () => {
      delete winRec.gm_authFailure;
    };
  }, []);

  useEffect(() => {
    if (!apiKey) {
      setLoadAttempted(true);
      return;
    }
    let cancelled = false;
    void loadGoogleMapsPlaces(apiKey)
      .then(async () => {
        const w = window as unknown as PlacesWindow;
        let places = w.google?.maps?.places;
        if (!places?.AutocompleteSuggestion && w.google?.maps?.importLibrary) {
          try {
            places = await w.google.maps.importLibrary('places');
          } catch {
            places = undefined;
          }
        }
        if (cancelled) return;
        if (!places?.AutocompleteSuggestion || !places.AutocompleteSessionToken) {
          setPlacesAvailable(false);
          setLoadAttempted(true);
          return;
        }
        try {
          placesRef.current = places;
          sessionTokenRef.current = new places.AutocompleteSessionToken();
          setPlacesAvailable(true);
        } catch {
          setPlacesAvailable(false);
        } finally {
          setLoadAttempted(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPlacesAvailable(false);
        setLoadAttempted(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    const places = placesRef.current;
    if (!placesAvailable || !places?.AutocompleteSuggestion) return;
    const query = value.trim();
    if (query.length < 2) {
      setPredictions([]);
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
      } catch {
        if (cancelled) return;
        setPlacesAvailable(false);
        setPredictions([]);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, placesAvailable]);

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
    const places = placesRef.current;
    if (places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }
  }

  const showDropdown = placesAvailable && open && predictions.length > 0;
  const showUnavailableNote = !!apiKey && loadAttempted && !placesAvailable;

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
        aria-autocomplete={placesAvailable ? 'list' : 'none'}
        aria-expanded={showDropdown}
        autoComplete="off"
      />
      {!apiKey && (
        <p className="mt-1 text-xs text-slate-500">
          Address suggestions unavailable — type freely.
        </p>
      )}
      {showUnavailableNote && (
        <p className="mt-1 text-xs text-slate-500">
          Address suggestions unavailable — type freely.
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

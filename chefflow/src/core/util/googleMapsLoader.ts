// Lazy loader for the Google Maps JavaScript API. Idempotent: parallel callers
// share a single load. The script attaches `google.maps.places` to `window`,
// which `LocationAutocomplete` reads through a minimal inline type.

let loaderPromise: Promise<void> | null = null;

interface GoogleMapsWindow {
  google?: { maps?: { places?: unknown } };
}

export function loadGoogleMapsPlaces(apiKey: string): Promise<void> {
  if (loaderPromise) return loaderPromise;

  const w = window as unknown as GoogleMapsWindow;
  if (w.google?.maps?.places) {
    loaderPromise = Promise.resolve();
    return loaderPromise;
  }

  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = `__chefflowGmapsInit_${Math.random().toString(36).slice(2)}`;
    const winRec = window as unknown as Record<string, unknown>;
    winRec[callbackName] = () => {
      resolve();
      delete winRec[callbackName];
    };
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      delete winRec[callbackName];
      loaderPromise = null;
      reject(new Error('Failed to load Google Maps JavaScript API'));
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

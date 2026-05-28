// Google Maps Distance Matrix client for the workflow commute estimate.
// Powers POST /api/commute/estimate — the SPA's Workflow page calls
// this when the event has a `location` AND the chef has set
// `homeAddress` in Settings, so the page can show "Leave home by X to
// arrive Y minutes early for service".
//
// API surface: https://developers.google.com/maps/documentation/distance-matrix/distance-matrix
// Requires a Cloudflare worker secret `GOOGLE_MAPS_API_KEY` with
// "Distance Matrix API" enabled in the same Google Cloud project.
// Falls back gracefully when the secret is unset (returns no-key
// reason) so the route still 200s and the SPA hides the banner.
//
// Cost guard: each request bills ~$0.005 USD against Google. We don't
// rate-limit per-user yet (the call only fires from the workflow page,
// and chefs only generate workflows N times per event) but a tracking
// counter would be the next step if a paying user starts running them
// in a loop.

const ENDPOINT = 'https://maps.googleapis.com/maps/api/distancematrix/json';

export class CommuteError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'CommuteError';
  }
}

/** Loose fetch shape — the worker passes its own `fetchImpl` which is
 *  typed `(input: string, init?: RequestInit) => Promise<Response>`
 *  (the `FetchLike` alias used elsewhere). The default `fetch` is also
 *  acceptable. */
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CommuteEstimateInput {
  origin: string;
  destination: string;
  apiKey: string;
  fetchImpl?: FetchLike;
}

export interface CommuteEstimateResult {
  /** Driving time including typical traffic, in seconds. */
  durationSeconds: number;
  /** Distance in metres. */
  distanceMeters: number;
  /** Google's resolved "we routed from / to" labels — surfaced so the
   *  chef sees what address Google actually used. */
  resolvedOrigin: string;
  resolvedDestination: string;
}

interface DistanceMatrixElement {
  status: string;
  duration?: { value: number; text: string };
  distance?: { value: number; text: string };
}

interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

interface DistanceMatrixResponse {
  status: string;
  origin_addresses?: string[];
  destination_addresses?: string[];
  rows?: DistanceMatrixRow[];
  error_message?: string;
}

export async function estimateCommute(input: CommuteEstimateInput): Promise<CommuteEstimateResult> {
  const fetchImpl: FetchLike = input.fetchImpl ?? ((u, init) => fetch(u, init));
  if (!input.origin.trim() || !input.destination.trim()) {
    throw new CommuteError('origin and destination required', 400);
  }
  const url =
    `${ENDPOINT}?` +
    `units=metric` +
    `&origins=${encodeURIComponent(input.origin)}` +
    `&destinations=${encodeURIComponent(input.destination)}` +
    `&mode=driving` +
    `&key=${encodeURIComponent(input.apiKey)}`;

  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new CommuteError(`Distance Matrix HTTP ${res.status}`, res.status);
  }
  const body = (await res.json()) as DistanceMatrixResponse;
  if (body.status !== 'OK') {
    throw new CommuteError(`Distance Matrix returned ${body.status}: ${body.error_message ?? ''}`, 502);
  }
  const element = body.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK' || !element.duration || !element.distance) {
    throw new CommuteError(
      `Distance Matrix element status ${element?.status ?? 'missing'}`,
      502,
    );
  }
  return {
    durationSeconds: element.duration.value,
    distanceMeters: element.distance.value,
    resolvedOrigin: body.origin_addresses?.[0] ?? input.origin,
    resolvedDestination: body.destination_addresses?.[0] ?? input.destination,
  };
}

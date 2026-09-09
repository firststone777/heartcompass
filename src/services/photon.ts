import { db } from '../db/schema';
import type { GeocodeCandidate } from '../types';

/**
 * Client per Photon (https://photon.komoot.io), geocoder open source costruito
 * sugli stessi dati di OpenStreetMap ma pensato per la ricerca *per nome* con
 * tolleranza agli errori, che è esattamente il caso d'uso di questa app
 * ("Le Levain", "Fabrica", "Blind pig"): Nominatim è ottimizzato per gli
 * indirizzi e su questi nomi spesso non restituisce nulla.
 *
 * Gratuito, senza API key e senza registrazione. L'istanza pubblica chiede un
 * uso ragionevole: qui le chiamate sono in coda con spaziatura minima e i
 * risultati finiscono nella stessa cache locale usata per Nominatim, così una
 * ricerca identica non viene mai ripetuta.
 */

const PHOTON_BASE = 'https://photon.komoot.io/api/';
const MIN_INTERVAL_MS = 350;
const RESULT_LIMIT = 8;

/** Tipi OSM che sono davvero un "posto dove andare", non un'area geografica. */
const POI_KEYS = new Set(['amenity', 'shop', 'tourism', 'leisure', 'office', 'craft']);

export function isPoiKind(kind: string | undefined): boolean {
  if (!kind) return false;
  return POI_KEYS.has(kind.split('/')[0]);
}

let queue: Promise<unknown> = Promise.resolve();
let lastDispatchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastDispatchAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastDispatchAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
  };
}

function toCandidate(feature: PhotonFeature): GeocodeCandidate | null {
  const coords = feature.geometry?.coordinates;
  const props = feature.properties;
  if (!coords || !props?.name) return null;

  const [lng, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const city = props.city ?? props.county ?? '';
  const displayName = [
    props.name,
    [props.street, props.housenumber].filter(Boolean).join(' '),
    city,
    props.country,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    lat,
    lng,
    displayName,
    importance: 0,
    poiName: props.name,
    city,
    kind: props.osm_key ? `${props.osm_key}/${props.osm_value ?? ''}` : undefined,
    source: 'photon',
  };
}

/**
 * Cerca per nome su Photon, con la posizione data come centro di preferenza.
 * Non lancia mai: in caso di errore o rete assente ritorna [].
 */
export async function photonSearch(query: string, near?: { lat: number; lng: number } | null): Promise<GeocodeCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `photon|${trimmed.toLowerCase().replace(/\s+/g, ' ')}${
    near ? `|@${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''
  }`;
  const cached = await db.geocodeCache.get(cacheKey);
  if (cached) return cached.results;

  const params = new URLSearchParams({ q: trimmed, limit: String(RESULT_LIMIT) });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }

  const results = await throttled(async () => {
    const res = await fetch(`${PHOTON_BASE}?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Photon ha risposto ${res.status}`);
    const data = (await res.json()) as { features?: PhotonFeature[] };
    return (data.features ?? []).map(toCandidate).filter((c): c is GeocodeCandidate => c !== null);
  }).catch(() => [] as GeocodeCandidate[]);

  await db.geocodeCache.put({ query: cacheKey, results, timestamp: Date.now() });
  return results;
}

import { db } from '../db/schema';
import type { GeocodeCandidate } from '../types';
import { haversineDistanceMeters } from './distance';
import { similarityRatio } from './textSimilarity';
import { cleanPlaceName, corePlaceName, distinctiveTokens } from './nameCleanup';
import { isPoiKind, photonSearch } from './photon';
import {
  extractFirstUrl,
  isShortenedMapsLink,
  parseGoogleMapsLink,
  placeNameFromMapsUrl,
  shareTextAddressOnly,
  shareTextToQuery,
} from './mapsLinks';

/**
 * Client per Nominatim (geocoder di OpenStreetMap), l'unico gratuito senza API key.
 * La sua usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 * impone: max 1 richiesta/secondo, identificazione del client, cache dei risultati.
 * Dal browser non si può impostare uno User-Agent custom (i fetch lo bloccano per
 * sicurezza): l'identificazione avviene tramite il Referer che il browser invia
 * automaticamente con l'origine dell'app, per questo non va disattivato altrove.
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100; // poco sopra 1 richiesta/secondo, con margine
const RESULT_LIMIT = 8;
const NEAR_RADIUS_KM = 8;

export interface LatLng {
  lat: number;
  lng: number;
}

let queue: Promise<unknown> = Promise.resolve();
let lastDispatchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Accoda una chiamata rispettando lo spacing minimo, indipendentemente da errori precedenti. */
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

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
  boundingbox?: [string, string, string, string]; // latMin, latMax, lonMin, lonMax
}

function toCandidate(r: NominatimResult): GeocodeCandidate {
  const bb = r.boundingbox;
  return {
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    displayName: r.display_name,
    importance: r.importance ?? 0,
    bbox: bb ? [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])] : undefined,
    source: 'nominatim',
  };
}

async function nominatimSearch(params: Record<string, string>): Promise<GeocodeCandidate[]> {
  const query = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '0',
    limit: String(RESULT_LIMIT),
    ...params,
  });
  return throttled(async () => {
    const res = await fetch(`${NOMINATIM_BASE}/search?${query}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim ha risposto ${res.status}`);
    const data = (await res.json()) as NominatimResult[];
    return data.map(toCandidate);
  }).catch(() => [] as GeocodeCandidate[]); // fallimento di rete: nessun candidato, mai un posto "inventato"
}

interface GeoBox {
  lonMin: number;
  latMin: number;
  lonMax: number;
  latMax: number;
}

function boxAround(center: LatLng, km: number): GeoBox {
  const dLat = km / 111;
  // alle nostre latitudini un grado di longitudine è più corto: si scala col coseno
  const dLon = km / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  return {
    lonMin: center.lng - dLon,
    latMin: center.lat - dLat,
    lonMax: center.lng + dLon,
    latMax: center.lat + dLat,
  };
}

function boxParam(box: GeoBox): string {
  return `${box.lonMin},${box.latMax},${box.lonMax},${box.latMin}`;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function fetchFromCache(key: string): Promise<GeocodeCandidate[] | undefined> {
  const entry = await db.geocodeCache.get(key);
  return entry?.results;
}

async function saveToCache(key: string, results: GeocodeCandidate[]): Promise<void> {
  await db.geocodeCache.put({ query: key, results, timestamp: Date.now() });
}

/** Riquadro della città, cercato una volta sola e poi tenuto in cache: serve a restringere le ricerche per nome. */
async function cityBox(city: string): Promise<GeoBox | null> {
  const key = `citybox|${normalizeKey(city)}`;
  const cached = await fetchFromCache(key);
  const cachedBox = cached?.[0]?.bbox;
  if (cached) {
    return cachedBox ? { lonMin: cachedBox[0], latMin: cachedBox[1], lonMax: cachedBox[2], latMax: cachedBox[3] } : null;
  }

  const results = await nominatimSearch({ q: city, limit: '1' });
  await saveToCache(key, results.slice(0, 1));
  if (results[0]) rememberCityCenter(city, { lat: results[0].lat, lng: results[0].lng });
  const bbox = results[0]?.bbox;
  return bbox ? { lonMin: bbox[0], latMin: bbox[1], lonMax: bbox[2], latMax: bbox[3] } : null;
}

function dedupe(candidates: GeocodeCandidate[]): GeocodeCandidate[] {
  const seen = new Set<string>();
  const unique: GeocodeCandidate[] = [];
  for (const candidate of candidates) {
    // 4 decimali (~11 m): unisce lo stesso posto restituito da Photon e da Nominatim
    const key = `${candidate.lat.toFixed(4)},${candidate.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

function sortCandidates(candidates: GeocodeCandidate[], near?: LatLng | null): GeocodeCandidate[] {
  if (near) {
    // se so dove sono, il candidato più vicino è quasi sempre quello giusto
    return [...candidates].sort(
      (a, b) => haversineDistanceMeters(near, a) - haversineDistanceMeters(near, b),
    );
  }
  return [...candidates].sort((a, b) => b.importance - a.importance);
}

/**
 * Mette davanti i candidati che nominano la città di riferimento: senza questo,
 * un omonimo più famoso in un'altra città vince solo perché ha "importanza"
 * più alta su Nominatim.
 */
function preferCityMatches(candidates: GeocodeCandidate[], city: string): GeocodeCandidate[] {
  if (!city) return candidates;
  const needle = normalizeKey(city);
  const inCity = candidates.filter((c) => normalizeKey(c.displayName).includes(needle));
  if (inCity.length === 0) return candidates;
  const others = candidates.filter((c) => !normalizeKey(c.displayName).includes(needle));
  return [...inCity, ...others];
}

function searchCacheKey(name: string, city: string, near?: LatLng | null): string {
  const base = `${normalizeKey(name)}|${normalizeKey(city)}`;
  // la posizione cambia i risultati: la chiave include una cella grossolana (~1 km)
  return near ? `${base}|@${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : base;
}

/** Nome proprio del posto dentro un candidato (Photon lo dà separato, Nominatim lo mette in testa). */
function candidatePoiName(candidate: GeocodeCandidate): string {
  return candidate.poiName ?? candidate.displayName.split(',')[0]?.trim() ?? '';
}

/**
 * La città deve combaciare per intero, non come sottostringa: mezza Italia ha
 * una "Via Roma", e con un controllo lasco "Al cantuccio" finisce a San Michele
 * all'Adige e "The vista terrace" in Turchia (su "Roma street").
 */
function cityMatches(candidate: GeocodeCandidate, city: string): boolean {
  if (!city) return true;
  const needle = normalizeKey(city);

  // Photon dà la città come campo a sé: è il confronto più affidabile
  if (candidate.city) return normalizeKey(candidate.city) === needle;

  // Nominatim dà l'indirizzo completo a componenti separate da virgola:
  // deve combaciare un componente intero
  return candidate.displayName.split(',').some((part) => normalizeKey(part) === needle);
}

const AUTO_ACCEPT_SIMILARITY = 0.9;
const MIN_TOKEN_COVERAGE = 0.6;
const MIN_SINGLE_RESULT_SIMILARITY = 0.55;

/**
 * Riconosce il caso "nome accorciato": nella mia lista sta "Shell bistrot
 * libreria", in OpenStreetMap sta "Shell Bistrot". È attendibile solo se ogni
 * parola distintiva del nome OSM è presente anche nel mio, se copre una buona
 * parte del mio nome e se almeno una parola condivisa è abbastanza lunga da
 * essere davvero caratterizzante: così "Leon's Place Hotel" non viene accettato
 * su "The B Place Hotel", che condivide solo parole banali.
 */
function isNameTruncation(rowName: string, candidateName: string): boolean {
  const mine = distinctiveTokens(rowName);
  const theirs = distinctiveTokens(candidateName);
  if (mine.length === 0 || theirs.length === 0) return false;

  const mineSet = new Set(mine);
  if (!theirs.every((token) => mineSet.has(token))) return false;
  if (theirs.length / mine.length < MIN_TOKEN_COVERAGE) return false;

  // La parola più caratterizzante del mio nome deve esserci: senza questo
  // "Barnum campo de fiori" viene accettato sul "Forno Campo de Fiori", che
  // condivide solo il nome della piazza.
  const mostDistinctive = [...mine].sort((a, b) => b.length - a.length)[0];
  if (!theirs.includes(mostDistinctive)) return false;

  return theirs.some((token) => token.length >= 4);
}

/**
 * Sceglie il candidato di cui possiamo fidarci senza chiedere conferma.
 * Deliberatamente severa: si accetta solo se il nome combacia (alla lettera o
 * come nome accorciato) E l'oggetto è davvero un locale, non un'area
 * geografica. Senza il controllo sul tipo, "Sugo Ponte Milvio" finirebbe sul
 * ponte, "Bitrattoria Casal Bernocchi" in mezzo al quartiere e "Barnum campo de
 * fiori" sulla piazza. Tutto il resto diventa un candidato da confermare.
 * Resta valido il comportamento storico: un unico risultato di Nominatim va bene.
 */
export function pickConfidentMatch(
  name: string,
  city: string,
  candidates: GeocodeCandidate[],
): GeocodeCandidate | undefined {
  const cleaned = cleanPlaceName(name, city);
  const target = normalizeKey(cleaned);

  const strong = candidates.find((candidate) => {
    // i risultati Photon portano il tipo OSM: se non è un locale, niente automatismo
    if (candidate.source === 'photon' && !isPoiKind(candidate.kind)) return false;
    if (!cityMatches(candidate, city)) return false;

    const poiName = candidatePoiName(candidate);
    if (similarityRatio(target, normalizeKey(poiName)) >= AUTO_ACCEPT_SIMILARITY) return true;
    // il "nome accorciato" lo accettiamo solo da Photon, che ci dice il tipo di oggetto
    return candidate.source === 'photon' && isNameTruncation(cleaned, poiName);
  });
  if (strong) return strong;

  // Comportamento storico: un unico risultato di Nominatim vale come conferma,
  // ma solo se è nella città giusta e se il nome ha almeno una somiglianza
  // plausibile. Senza questi due paletti "Pescaria" si salvava in Spagna e
  // "Osteria del sole" sulla "Prenestina Osteria dell'Osa" a Lunghezza.
  const fromNominatim = candidates.filter((c) => c.source !== 'photon');
  if (fromNominatim.length === 1) {
    const only = fromNominatim[0];
    const plausible = similarityRatio(target, normalizeKey(candidatePoiName(only))) >= MIN_SINGLE_RESULT_SIMILARITY;
    if (cityMatches(only, city) && plausible) return only;
  }

  return undefined;
}

/**
 * Cerca un posto per nome, provando fonti e formulazioni sempre più larghe
 * finché non trova qualcosa. In ordine:
 *  1. Photon (ricerca per nome tollerante agli errori sui dati OSM): è la fonte
 *     che funziona meglio sui nomi dei locali ed è anche la più rapida, quindi
 *     se dà un risultato attendibile si chiude qui con una sola chiamata;
 *  2. Nominatim vicino a dove sei ora (se la posizione è nota) + "nome, città";
 *  3. nome "essenziale" senza le parole di categoria, su entrambe le fonti;
 *  4. ricerca strutturata per punto di interesse e nome dentro il riquadro della città.
 * Ritorna tutti i candidati trovati: se sono più di uno la UI li fa scegliere,
 * ed è così che si gestiscono gli omonimi. Non lancia mai eccezioni: se non
 * trova nulla ritorna [].
 */
export async function searchPlace(name: string, city = '', near?: LatLng | null): Promise<GeocodeCandidate[]> {
  const raw = name.trim();
  if (!raw) return [];

  const key = searchCacheKey(raw, city, near);
  const cached = await fetchFromCache(key);
  if (cached) return cached;

  const cleaned = cleanPlaceName(raw, city);
  const core = corePlaceName(cleaned);
  const withCity = city ? `${cleaned}, ${city}` : cleaned;

  const collected: GeocodeCandidate[] = [];
  const finish = async (): Promise<GeocodeCandidate[]> => {
    const unique = dedupe(collected);
    // La posizione attuale ordina i risultati solo se c'entra davvero qualcosa:
    // se sto a Roma e cerco un posto di Milano, il più vicino a me non è il più
    // probabile, e in quel caso conta la rilevanza.
    const nearIsRelevant = near != null && unique.some((c) => haversineDistanceMeters(near, c) < 30000);
    const sorted = preferCityMatches(sortCandidates(unique, nearIsRelevant ? near : null), city);
    await saveToCache(key, sorted);
    return sorted;
  };

  // 1. Photon per nome: veloce, e se il nome combacia davvero non serve altro
  collected.push(...(await photonSearch(withCity, near ?? cityCenterHint(city))));
  if (pickConfidentMatch(raw, city, collected)) return finish();

  // 2. Nominatim: vicino a me (se so dove sono) e in forma libera "nome, città"
  if (near) {
    collected.push(
      ...(await nominatimSearch({ q: cleaned, viewbox: boxParam(boxAround(near, NEAR_RADIUS_KM)), bounded: '1' })),
    );
  }
  collected.push(...(await nominatimSearch({ q: withCity })));
  if (collected.length > 0) return finish();

  // 3. nome essenziale, senza le parole di categoria
  if (core) {
    const coreWithCity = city ? `${core}, ${city}` : core;
    collected.push(...(await photonSearch(coreWithCity, near ?? cityCenterHint(city))));
    if (collected.length === 0) collected.push(...(await nominatimSearch({ q: coreWithCity })));
    if (collected.length > 0) return finish();
  }

  // 4. ultime spiagge su Nominatim: ricerca strutturata e nome nel riquadro città
  if (city) {
    collected.push(...(await nominatimSearch({ amenity: cleaned, city })));
    if (collected.length === 0) {
      const box = await cityBox(city);
      if (box) collected.push(...(await nominatimSearch({ q: cleaned, viewbox: boxParam(box), bounded: '1' })));
    }
  }

  return finish();
}

/**
 * Centro approssimativo della città da usare come preferenza per Photon quando
 * non conosciamo la posizione dell'utente. Usa solo la cache: se la città non è
 * mai stata cercata non fa una chiamata in più solo per questo.
 */
let cityCenterCache: Record<string, LatLng | null> = {};
function cityCenterHint(city: string): LatLng | null {
  if (!city) return null;
  return cityCenterCache[normalizeKey(city)] ?? null;
}
export function rememberCityCenter(city: string, center: LatLng): void {
  cityCenterCache = { ...cityCenterCache, [normalizeKey(city)]: center };
}

/** Reverse geocoding best-effort: usato solo per mostrare un'etichetta leggibile su un pin manuale. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  const key = `rev|${lat.toFixed(5)}|${lng.toFixed(5)}`;
  const cached = await fetchFromCache(key);
  if (cached?.[0]) return cached[0].displayName;

  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`;
  const result = await throttled(async () => {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim ha risposto ${res.status}`);
    const data = (await res.json()) as NominatimResult;
    return data.display_name;
  }).catch(() => undefined);

  if (result) {
    await saveToCache(key, [{ lat, lng, displayName: result, importance: 0 }]);
  }
  return result;
}

/**
 * Espansione di un link corto (quello che dà "Condividi" dentro l'app Google Maps).
 * Il redirect non è leggibile dal browser per via del CORS, quindi ci si appoggia a
 * un servizio pubblico gratuito che restituisce l'URL finale. È volutamente
 * l'ultima spiaggia: se non risponde, il flusso prosegue con il testo condiviso e
 * poi col pin manuale, senza mai bloccare l'inserimento.
 */
const UNSHORTEN_ENDPOINTS = [
  (url: string) => `https://unshorten.me/s/${encodeURIComponent(url)}`,
  (url: string) => `https://unshorten.me/json/${encodeURIComponent(url)}`,
];

async function fetchTextWithTimeout(url: string, timeoutMs = 9000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function expandShortMapsLink(shortUrl: string): Promise<string | null> {
  for (const buildUrl of UNSHORTEN_ENDPOINTS) {
    const body = await fetchTextWithTimeout(buildUrl(shortUrl));
    if (!body) continue;

    let resolved: string | undefined;
    const trimmed = body.trim();
    if (trimmed.startsWith('{')) {
      try {
        resolved = (JSON.parse(trimmed) as { resolved_url?: string }).resolved_url;
      } catch {
        resolved = undefined;
      }
    } else {
      resolved = trimmed;
    }

    if (resolved && /^https?:\/\//i.test(resolved)) return resolved;
  }
  return null;
}

export type MapsShareResult =
  | { kind: 'coords'; lat: number; lng: number; label?: string; via: 'link' | 'link_espanso' }
  | { kind: 'candidates'; candidates: GeocodeCandidate[]; via: 'testo' }
  | { kind: 'failed' };

/**
 * Prende quello che l'utente ha incollato (o condiviso dall'app Google Maps) e
 * prova, in ordine: coordinate dentro un link esteso, espansione del link corto,
 * geocodifica del nome/indirizzo presenti nel testo condiviso.
 */
export async function resolveMapsShare(input: string, city = '', near?: LatLng | null): Promise<MapsShareResult> {
  const raw = input.trim();
  if (!raw) return { kind: 'failed' };

  const url = extractFirstUrl(raw);
  if (url) {
    const direct = parseGoogleMapsLink(url);
    if (direct) return { kind: 'coords', ...direct, label: placeNameFromMapsUrl(url), via: 'link' };

    if (isShortenedMapsLink(url)) {
      const expanded = await expandShortMapsLink(url);
      const coords = expanded ? parseGoogleMapsLink(expanded) : null;
      if (coords && expanded) {
        return { kind: 'coords', ...coords, label: placeNameFromMapsUrl(expanded), via: 'link_espanso' };
      }
    }
  }

  const query = shareTextToQuery(raw);
  if (query) {
    // Il testo condiviso contiene di solito nome + indirizzo. Si provano più
    // formulazioni e si uniscono i risultati, invece di fermarsi alla prima che
    // risponde: "Pantheon, Piazza della Rotonda, Roma" da solo, per Nominatim,
    // pesca il Panthéon di Parigi, che è più "importante".
    const queries = [query];
    const addressOnly = shareTextAddressOnly(raw);
    if (addressOnly && addressOnly !== query) queries.push(addressOnly);
    if (city && !normalizeKey(query).includes(normalizeKey(city))) queries.push(`${query}, ${city}`);

    const collected: GeocodeCandidate[] = [];
    for (const q of queries) {
      collected.push(...(await searchPlace(q, '', near)));
      if (collected.length >= 5) break; // abbastanza alternative, inutile insistere su Nominatim
    }

    const candidates = preferCityMatches(sortCandidates(dedupe(collected), near), city);
    if (candidates.length > 0) return { kind: 'candidates', candidates, via: 'testo' };
  }

  return { kind: 'failed' };
}

export { parseGoogleMapsLink, isShortenedMapsLink } from './mapsLinks';

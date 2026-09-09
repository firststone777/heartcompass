// Tipi condivisi di dominio. Un "posto" (Place) è l'entità centrale dell'app.

export type PlaceStatus = 'da_provare' | 'visitato' | 'scartato';

export type GeocodeSource = 'nominatim' | 'photon' | 'manual_pin' | 'gmaps_link' | 'manual_coords';

export interface Category {
  id: string; // slug, es. "pizzeria"
  label: string;
  emoji: string;
  /** colore scelto liberamente dall'utente (hex), usato per il pin sulla mappa e i chip */
  color: string;
  /** true per le categorie di serie fornite con l'app (non cancellabili, solo rinominabili) */
  builtIn: boolean;
  order: number;
}

export interface Place {
  id: string;
  name: string;
  city: string;
  categories: string[]; // id categoria, un posto può averne più di una
  tags: string[];
  status: PlaceStatus;
  lat: number;
  lng: number;
  geocodeSource: GeocodeSource;
  /** indirizzo/etichetta restituita dal geocoder, solo a scopo informativo */
  address?: string;
  /** sotto-etichetta di cucina per la categoria "ristorante etnico" (es. "coreano") */
  cuisine?: string;
  notes: string;
  visitRating?: number; // 1-5, solo se status === 'visitato'
  visitDate?: string; // ISO date
  visitNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GeocodeCandidate {
  lat: number;
  lng: number;
  displayName: string;
  importance: number;
  /** riquadro [lonMin, latMin, lonMax, latMax] restituito da Nominatim, usato per limitare le ricerche a una città */
  bbox?: [number, number, number, number];
  /** nome proprio del punto di interesse, separato dall'indirizzo completo (lo dà Photon) */
  poiName?: string;
  /** città del risultato, per capire se siamo nel posto giusto */
  city?: string;
  /** tipo OSM del risultato, es. "amenity/cafe" oppure "place/square" */
  kind?: string;
  source?: 'nominatim' | 'photon';
}

export interface GeocodeCacheEntry {
  query: string; // chiave normalizzata
  results: GeocodeCandidate[];
  timestamp: number;
}

/** Riga grezza prodotta dal parser dell'import in blocco, prima della geocodifica/revisione. */
export interface ImportDraftRow {
  id: string;
  rawLine: string;
  name: string;
  city: string;
  suggestedCategories: string[];
  suggestedTags: string[];
  notes: string;
  cuisine?: string;
  // stato di avanzamento nella wizard
  geocodeStatus: 'pending' | 'searching' | 'found' | 'ambiguous' | 'not_found' | 'skipped';
  candidates?: GeocodeCandidate[];
  chosen?: GeocodeCandidate;
  chosenSource?: GeocodeSource;
  decision: 'pending' | 'approved' | 'discarded';
  possibleDuplicateOf?: string; // id di un place esistente
}

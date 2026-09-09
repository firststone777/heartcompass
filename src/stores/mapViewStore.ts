import { signal } from '@preact/signals';

export interface MapViewport {
  center: [number, number]; // lng, lat
  zoom: number;
}

const STORAGE_KEY = 'bussola:map-viewport';

function readStored(): MapViewport | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapViewport;
    return Array.isArray(parsed.center) && Number.isFinite(parsed.zoom) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Ultima inquadratura della mappa (centro + zoom). Serve a non perdere il punto
 * dove stavi guardando quando apri la scheda di un posto e torni indietro: il
 * componente mappa viene smontato e ricreato, quindi senza questo ripartirebbe
 * ogni volta dalla vista d'insieme.
 */
export const mapViewport = signal<MapViewport | null>(readStored());

export function saveMapViewport(view: MapViewport): void {
  mapViewport.value = view;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    // storage non disponibile: resta comunque in memoria per questa sessione
  }
}

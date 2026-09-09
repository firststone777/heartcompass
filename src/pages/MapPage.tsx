import { useCallback, useMemo, useRef, useState } from 'preact/hooks';
import type { Map as MaplibreMapInstance } from 'maplibre-gl';
import { filteredPlaces } from '../stores/filtersStore';
import { places } from '../stores/placesStore';
import { categories as categoriesSignal, categoryById } from '../stores/categoriesStore';
import { mapViewport, saveMapViewport } from '../stores/mapViewStore';
import type { MapMarkerSpec } from '../components/map/MapLibreMap';
import { LazyMap } from '../components/map/LazyMap';
import { MapPlacePreview } from '../components/map/MapPlacePreview';
import { FilterBar } from '../components/filters/FilterBar';
import { ROME_CENTER } from '../services/mapConfig';

const NO_CATEGORY_COLOR = 'var(--text-muted)';

export function MapPage() {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mapRef = useRef<MaplibreMapInstance | null>(null);
  const hasFitted = useRef(false);

  // inquadratura iniziale: quella di prima se c'è, altrimenti Roma in attesa del fit
  const savedView = useRef(mapViewport.value);
  const initialCenter = savedView.current?.center ?? ROME_CENTER;
  const initialZoom = savedView.current?.zoom ?? 12;

  // memoizzato sulla lista filtrata e sulle categorie: selezionare un pin non
  // deve far ricostruire tutti gli altri marker
  const visible = filteredPlaces.value;
  const allCategories = categoriesSignal.value;
  const markers: MapMarkerSpec[] = useMemo(
    () =>
      visible.map(({ place }) => {
        const cat = place.categories.length > 0 ? categoryById(place.categories[0]) : undefined;
        return {
          id: place.id,
          lng: place.lng,
          lat: place.lat,
          color: cat ? cat.color : NO_CATEGORY_COLOR,
          emoji: cat?.emoji ?? '📍',
          onClick: () => selectPlace(place.id, place.lng, place.lat),
        };
      }),
    [visible, allCategories],
  );

  function selectPlace(id: string, lng: number, lat: number) {
    setSelectedId(id);
    // sposta il punto un po' più in alto, così non finisce sotto l'anteprima
    mapRef.current?.easeTo({ center: [lng, lat], offset: [0, -70], duration: 350 });
  }

  function handleMapReady(map: MaplibreMapInstance) {
    mapRef.current = map;
    if (!savedView.current) fitToAllPlaces(map);
  }

  function fitToAllPlaces(map: MaplibreMapInstance) {
    if (hasFitted.current || places.value.length === 0) return;
    hasFitted.current = true;
    // Bounding box calcolato a mano: evita di importare la classe LngLatBounds
    // qui, così questo file non tira dentro maplibre-gl nel bundle principale
    // (lo carica solo LazyMap, al bisogno).
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of places.value) {
      minLng = Math.min(minLng, p.lng);
      maxLng = Math.max(maxLng, p.lng);
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 48, maxZoom: 15, duration: 0 },
    );
  }

  // useCallback: l'handler viene passato alla mappa e non deve cambiare a ogni render
  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    saveMapViewport({ center: [center.lng, center.lat], zoom: map.getZoom() });
  }, []);

  const clearSelection = useCallback(() => setSelectedId(null), []);

  const selected = selectedId ? places.value.find((p) => p.id === selectedId) : undefined;

  return (
    <div class="map-page">
      <div class="map-page-canvas">
        <LazyMap
          center={initialCenter}
          zoom={initialZoom}
          markers={markers}
          onMapReady={handleMapReady}
          onMoveEnd={handleMoveEnd}
          onClick={clearSelection}
        />
      </div>

      <button class="map-filter-toggle" onClick={() => setShowFilters((v) => !v)}>
        Filtri {markers.length}/{places.value.length}
      </button>

      {showFilters && (
        <div class="map-filter-panel">
          <FilterBar />
        </div>
      )}

      {selected ? (
        <MapPlacePreview place={selected} onClose={clearSelection} />
      ) : (
        <div class="map-legend">
          {categoriesSignal.value
            .filter((c) => places.value.some((p) => p.categories[0] === c.id))
            .map((c) => (
              <span key={c.id} class="map-legend-item">
                <span class="map-legend-dot" style={{ background: c.color }} />
                {c.emoji} {c.label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

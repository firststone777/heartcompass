import type { Place } from '../../types';
import { categories as categoriesSignal } from '../../stores/categoriesStore';
import { position } from '../../stores/geoStore';
import { haversineDistanceMeters, formatDistance } from '../../services/distance';
import { STATUS_LABELS } from '../../constants';
import { CategoryChip } from '../places/CategoryChip';
import { NavigateButton } from '../places/NavigateButton';
import { navigate } from '../../router';

/**
 * Anteprima del posto che compare in basso quando si tocca un pin, invece di
 * portare via dalla mappa: così la mappa non viene smontata e non si perde
 * l'inquadratura mentre si confrontano due o tre posti nella stessa zona.
 */
export function MapPlacePreview(props: { place: Place; onClose: () => void }) {
  const { place } = props;
  const cats = categoriesSignal.value.filter((c) => place.categories.includes(c.id));
  const here = position.value;
  const distance = here ? haversineDistanceMeters(here, place) : undefined;

  return (
    <div class="map-preview">
      <div class="map-preview-top">
        <div>
          <p class="map-preview-name">{place.name}</p>
          <p class="map-preview-meta">
            {place.city}
            {place.cuisine ? ` · ${place.cuisine}` : ''}
            {distance != null ? ` · ${formatDistance(distance)}` : ''}
          </p>
        </div>
        <div class="map-preview-head-right">
          <span class={`status-badge status-${place.status}`}>{STATUS_LABELS[place.status]}</span>
          <button class="sheet-close" onClick={props.onClose} aria-label="Chiudi anteprima">
            ✕
          </button>
        </div>
      </div>

      {(cats.length > 0 || place.tags.length > 0) && (
        <div class="place-card-chips">
          {cats.map((c) => (
            <CategoryChip key={c.id} category={c} size="sm" />
          ))}
          {place.tags.slice(0, 4).map((t) => (
            <span key={t} class="chip-tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div class="map-preview-actions">
        <NavigateButton lat={place.lat} lng={place.lng} class="btn-sm" />
        <button class="btn btn-secondary btn-sm" onClick={() => navigate('posto', place.id)}>
          Apri scheda
        </button>
      </div>
    </div>
  );
}

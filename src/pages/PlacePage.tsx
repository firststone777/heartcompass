import { useState } from 'preact/hooks';
import { places, placeById, editPlace, removePlace } from '../stores/placesStore';
import type { Place } from '../types';
import { PlaceForm } from '../components/places/PlaceForm';
import { NavigateButton } from '../components/places/NavigateButton';
import { navigate } from '../router';

export function PlacePage(props: { id: string }) {
  // legge da places.value (non da un signal locale) così la pagina si aggiorna
  // automaticamente se il posto viene modificato altrove
  const place = places.value.find((p) => p.id === props.id) ?? placeById(props.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!place) {
    return (
      <div class="page">
        <p>Posto non trovato.</p>
        <button class="btn btn-secondary" onClick={() => navigate('lista')}>
          Torna alla lista
        </button>
      </div>
    );
  }

  async function handleSave(changes: Partial<Place>) {
    await editPlace(place!.id, changes);
    navigate('lista');
  }

  async function handleDelete() {
    await removePlace(place!.id);
    navigate('lista');
  }

  return (
    <div class="page">
      {/* indietro esplicito: senza questo su iPhone l'unico modo è lo swipe di sistema */}
      <button class="back-link" onClick={() => history.back()}>
        ‹ Indietro
      </button>

      <div class="place-page-header">
        <h1 class="page-title">{place.name}</h1>
        <NavigateButton lat={place.lat} lng={place.lng} />
      </div>

      <PlaceForm place={place} onSave={handleSave} />

      <div class="danger-zone">
        {!confirmingDelete ? (
          <button class="btn btn-secondary btn-block" onClick={() => setConfirmingDelete(true)}>
            Elimina posto
          </button>
        ) : (
          <>
            <p class="hint-text">Confermi l'eliminazione? Non si può annullare.</p>
            <div class="danger-zone-actions">
              <button class="btn btn-secondary" onClick={() => setConfirmingDelete(false)}>
                Annulla
              </button>
              <button class="btn btn-danger" onClick={handleDelete}>
                Elimina definitivamente
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

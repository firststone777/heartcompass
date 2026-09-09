import { useEffect, useState } from 'preact/hooks';
import { newId } from '../utils/id';
import { getLastCity, setLastCity } from '../utils/preferences';
import { pickConfidentMatch, searchPlace } from '../services/geocoding';
import { findPossibleDuplicates, type DuplicateMatch } from '../services/duplicates';
import { addPlace, places } from '../stores/placesStore';
import { categories as categoriesSignal } from '../stores/categoriesStore';
import { geoStatus, position, requestLocation } from '../stores/geoStore';
import { consumePendingShare, pendingShare } from '../stores/shareStore';
import { shareTextToQuery } from '../services/mapsLinks';
import { navigate } from '../router';
import type { GeocodeCandidate, GeocodeSource, Place } from '../types';
import { GeocodeCandidatesModal } from '../components/places/GeocodeCandidatesModal';
import { ManualPinPicker } from '../components/places/ManualPinPicker';
import { MapsShareSheet } from '../components/places/MapsShareSheet';
import { DuplicateWarning } from '../components/places/DuplicateWarning';

interface ResolvedLocation {
  lat: number;
  lng: number;
  source: GeocodeSource;
  address?: string;
}

type Stage =
  | { kind: 'form' }
  | { kind: 'searching' }
  | { kind: 'candidates'; candidates: GeocodeCandidate[] }
  | { kind: 'not_found' }
  | { kind: 'manual_pin' }
  | { kind: 'maps_share'; initialText?: string }
  | { kind: 'confirm_duplicate'; resolved: ResolvedLocation; matches: DuplicateMatch[] };

export function AddPage() {
  const [name, setName] = useState('');
  const [city, setCity] = useState(getLastCity());
  const [categoryId, setCategoryId] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'form' });
  const [nameDuplicates, setNameDuplicates] = useState<DuplicateMatch[]>([]);

  // se si arriva qui da una condivisione di sistema, si parte già dal testo condiviso
  useEffect(() => {
    if (!pendingShare.value) return;
    const shared = consumePendingShare();
    if (!shared) return;
    const guessedName = shareTextToQuery(shared).split(',')[0]?.trim();
    if (guessedName) setName(guessedName);
    setStage({ kind: 'maps_share', initialText: shared });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onNameInput(value: string) {
    setName(value);
    setNameDuplicates(value.trim().length > 2 ? findPossibleDuplicates({ name: value }, places.value) : []);
  }

  async function commitPlace(resolved: ResolvedLocation) {
    const now = Date.now();
    const place: Place = {
      id: newId(),
      name: name.trim(),
      city: city.trim() || 'Roma',
      categories: categoryId ? [categoryId] : [],
      tags: [],
      status: 'da_provare',
      lat: resolved.lat,
      lng: resolved.lng,
      geocodeSource: resolved.source,
      address: resolved.address,
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    setLastCity(place.city);
    await addPlace(place);
    navigate('posto', place.id);
  }

  /** Punto unico dopo cui abbiamo delle coordinate: qui si controllano i duplicati per nome+posizione. */
  function resolveLocation(lat: number, lng: number, source: GeocodeSource, address?: string) {
    const resolved: ResolvedLocation = { lat, lng, source, address };
    const matches = findPossibleDuplicates({ name: name.trim(), lat, lng }, places.value);
    if (matches.length > 0) {
      setStage({ kind: 'confirm_duplicate', resolved, matches });
    } else {
      void commitPlace(resolved);
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setStage({ kind: 'searching' });
    // la posizione attuale, se disponibile, fa da bias: cercando "Vetro" mentre
    // sei a Trastevere vince il Vetro a due strade da te, non l'omonimo altrove
    const results = await searchPlace(name.trim(), city.trim(), position.value);
    const confident = pickConfidentMatch(name.trim(), city.trim(), results);
    if (confident) {
      resolveLocation(confident.lat, confident.lng, confident.source === 'photon' ? 'photon' : 'nominatim', confident.displayName);
    } else if (results.length > 0) {
      setStage({ kind: 'candidates', candidates: results });
    } else {
      setStage({ kind: 'not_found' });
    }
  }

  const currentPosition = position.value;

  return (
    <div class="page">
      <h1 class="page-title">Aggiungi un posto</h1>

      <div class="field">
        <label for="add-name">Nome</label>
        <input
          id="add-name"
          class="input"
          value={name}
          onInput={(e) => onNameInput((e.target as HTMLInputElement).value)}
          placeholder="Es. Retrobottega"
          autoFocus
        />
      </div>
      <DuplicateWarning matches={nameDuplicates} />

      <div class="field">
        <label for="add-city">Città</label>
        <input id="add-city" class="input" value={city} onInput={(e) => setCity((e.target as HTMLInputElement).value)} />
      </div>

      <div class="field">
        <label for="add-category">Categoria</label>
        <select
          id="add-category"
          class="select"
          value={categoryId}
          onChange={(e) => setCategoryId((e.target as HTMLSelectElement).value)}
        >
          <option value="">Nessuna (la scegli dopo)</option>
          {categoriesSignal.value.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <p class="hint-text">Determina subito il colore del pin sulla mappa. Puoi aggiungerne altre dopo, dalla scheda del posto.</p>
      </div>

      <div class="field">
        {currentPosition ? (
          <p class="hint-text">🎯 Cerco prima vicino a dove sei (±{Math.round(currentPosition.accuracy)} m)</p>
        ) : (
          <button class="btn btn-secondary btn-sm" onClick={requestLocation} disabled={geoStatus.value === 'locating'}>
            {geoStatus.value === 'locating' ? 'Localizzazione…' : '📍 Cerca vicino a me (più preciso)'}
          </button>
        )}
      </div>

      <button class="btn btn-primary btn-block" disabled={!name.trim() || stage.kind === 'searching'} onClick={handleSave}>
        {stage.kind === 'searching' ? 'Cerco le coordinate…' : 'Salva'}
      </button>

      {stage.kind === 'not_found' && (
        <div class="not-found-box">
          <p>Non ho trovato "{name}" a {city}. Nessun problema, si può fissare subito:</p>
          <button class="btn btn-secondary btn-block" onClick={() => setStage({ kind: 'maps_share' })}>
            🔗 Incolla da Google Maps (link o condivisione)
          </button>
          <button class="btn btn-secondary btn-block" onClick={() => setStage({ kind: 'manual_pin' })}>
            📍 Posiziona il pin sulla mappa
          </button>
        </div>
      )}

      {stage.kind === 'candidates' && (
        <GeocodeCandidatesModal
          candidates={stage.candidates}
          onChoose={(c) => resolveLocation(c.lat, c.lng, c.source === 'photon' ? 'photon' : 'nominatim', c.displayName)}
          onManual={() => setStage({ kind: 'manual_pin' })}
          onClose={() => setStage({ kind: 'form' })}
        />
      )}

      {stage.kind === 'manual_pin' && (
        <ManualPinPicker
          initialCenter={currentPosition ? [currentPosition.lng, currentPosition.lat] : undefined}
          onConfirm={(coords, label) => resolveLocation(coords.lat, coords.lng, 'manual_pin', label)}
          onClose={() => setStage({ kind: 'form' })}
        />
      )}

      {stage.kind === 'maps_share' && (
        <MapsShareSheet
          city={city}
          near={currentPosition}
          initialText={stage.initialText}
          onConfirm={(coords, label) => resolveLocation(coords.lat, coords.lng, 'gmaps_link', label)}
          onClose={() => setStage({ kind: 'form' })}
        />
      )}

      {stage.kind === 'confirm_duplicate' && (
        <div class="not-found-box">
          <DuplicateWarning matches={stage.matches} />
          <button class="btn btn-primary btn-block" onClick={() => commitPlace(stage.resolved)}>
            Salva comunque come posto nuovo
          </button>
          <button class="btn btn-secondary btn-block" onClick={() => navigate('posto', stage.matches[0].place.id)}>
            Vedi il posto esistente invece
          </button>
          <button class="btn btn-secondary btn-block" onClick={() => setStage({ kind: 'form' })}>
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

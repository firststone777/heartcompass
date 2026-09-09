import { useRef, useState } from 'preact/hooks';
import {
  wizardStage,
  wizardRows,
  wizardProgress,
  wizardRunning,
  wizardResult,
  beginReview,
  approveAllFound,
  resetWizard,
} from '../stores/importStore';
import { getLastCity, setLastCity } from '../utils/preferences';
import { addPlacesBulk } from '../stores/placesStore';
import { newId } from '../utils/id';
import type { Place } from '../types';
import { ReviewRow } from '../components/import/ReviewRow';
import { navigate } from '../router';

type ReviewFilter = 'tutte' | 'da_rivedere';

export function ImportPage() {
  const [rawText, setRawText] = useState('');
  const [defaultCity, setDefaultCity] = useState(getLastCity());
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('tutte');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadSeedFile() {
    const res = await fetch(`${import.meta.env.BASE_URL}seed/locali-roma.txt`);
    const text = await res.text();
    setLastCity('Roma');
    beginReview(text, 'Roma');
  }

  function loadFromFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => beginReview(String(reader.result ?? ''), defaultCity);
    reader.readAsText(file);
  }

  function loadFromPaste() {
    setLastCity(defaultCity);
    beginReview(rawText, defaultCity);
  }

  async function handleCommit() {
    const now = Date.now();
    const toImport: Place[] = wizardRows.value
      .filter((r) => r.decision === 'approved' && r.chosen)
      .map((r) => ({
        id: newId(),
        name: r.name.trim(),
        city: r.city.trim() || defaultCity,
        categories: r.suggestedCategories,
        tags: r.suggestedTags,
        status: 'da_provare',
        lat: r.chosen!.lat,
        lng: r.chosen!.lng,
        geocodeSource: r.chosenSource ?? 'nominatim',
        address: r.chosen!.displayName,
        cuisine: r.cuisine,
        notes: r.notes,
        createdAt: now,
        updatedAt: now,
      }));
    await addPlacesBulk(toImport);
    wizardResult.value = { imported: toImport.length };
    wizardStage.value = 'done';
  }

  if (wizardStage.value === 'done' && wizardResult.value) {
    return (
      <div class="page">
        <h1 class="page-title">Import completato</h1>
        <p>Importati {wizardResult.value.imported} posti.</p>
        <button class="btn btn-primary btn-block" onClick={() => navigate('lista')}>
          Vai alla lista
        </button>
        <button
          class="btn btn-secondary btn-block"
          style={{ marginTop: 8 }}
          onClick={resetWizard}
        >
          Fai un altro import
        </button>
      </div>
    );
  }

  if (wizardStage.value === 'reviewing') {
    const rows = wizardRows.value;
    const approved = rows.filter((r) => r.decision === 'approved').length;
    const discarded = rows.filter((r) => r.decision === 'discarded').length;
    const unresolved = rows.filter((r) => r.decision === 'pending' && (r.geocodeStatus === 'ambiguous' || r.geocodeStatus === 'not_found')).length;
    // distinguere le due cose evita di far sembrare tutto lavoro manuale: la
    // maggior parte delle righe da risolvere ha già una proposta pronta
    const conProposta = rows.filter((r) => r.decision === 'pending' && !r.chosen && (r.candidates?.length ?? 0) > 0).length;
    const daPosizionare = unresolved - conProposta;
    const shown = reviewFilter === 'tutte' ? rows : rows.filter((r) => r.decision === 'pending');

    return (
      <div class="page">
        <h1 class="page-title">Revisione import</h1>
        <div class="import-progress">
          <div class="import-progress-bar">
            <div class="import-progress-fill" style={{ width: `${(100 * wizardProgress.value.done) / Math.max(1, wizardProgress.value.total)}%` }} />
          </div>
          <p class="hint-text">
            {wizardProgress.value.done}/{wizardProgress.value.total} elaborati · {approved} approvati
            {conProposta > 0 ? ` · ${conProposta} con proposta da confermare` : ''}
            {daPosizionare > 0 ? ` · ${daPosizionare} da posizionare a mano` : ''}
            {discarded > 0 ? ` · ${discarded} scartati` : ''}
            {wizardRunning.value ? ' · sto ancora cercando…' : ''}
          </p>
        </div>

        <div class="import-toolbar">
          <button class="btn btn-secondary btn-sm" onClick={approveAllFound}>
            ✅ Approva tutti i trovati
          </button>
          <button class="btn btn-secondary btn-sm" onClick={() => setReviewFilter(reviewFilter === 'tutte' ? 'da_rivedere' : 'tutte')}>
            {reviewFilter === 'tutte' ? 'Mostra solo da rivedere' : 'Mostra tutte'}
          </button>
        </div>

        {shown.map((row) => (
          <ReviewRow key={row.id} row={row} />
        ))}

        <div class="import-commit-bar">
          <button class="btn btn-primary btn-block" disabled={approved === 0} onClick={handleCommit}>
            Importa {approved} posti
          </button>
          <button class="btn btn-secondary btn-block" onClick={resetWizard}>
            Annulla import
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="page">
      <h1 class="page-title">Importa posti</h1>

      <div class="field">
        <button class="btn btn-primary btn-block" onClick={loadSeedFile}>
          📥 Usa la lista iniziale di Roma (~140 posti)
        </button>
      </div>

      <p class="hint-text">oppure importa un tuo file/testo, nello stesso formato (intestazioni di sezione + elenco puntato con note tra parentesi):</p>

      <div class="field">
        <label for="import-city">Città di default per queste righe</label>
        <input id="import-city" class="input" value={defaultCity} onInput={(e) => setDefaultCity((e.target as HTMLInputElement).value)} />
      </div>

      <div class="field">
        <label for="import-file">Carica un file .txt</label>
        <input
          id="import-file"
          type="file"
          accept=".txt,text/plain"
          ref={fileInputRef}
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) loadFromFile(file);
          }}
        />
      </div>

      <div class="field">
        <label for="import-paste">…oppure incolla il testo qui</label>
        <textarea
          id="import-paste"
          class="input"
          rows={8}
          value={rawText}
          onInput={(e) => setRawText((e.target as HTMLTextAreaElement).value)}
        />
      </div>
      <button class="btn btn-secondary btn-block" disabled={!rawText.trim()} onClick={loadFromPaste}>
        Analizza il testo incollato
      </button>
    </div>
  );
}

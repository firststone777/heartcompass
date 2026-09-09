import { useState } from 'preact/hooks';
import type { ImportDraftRow } from '../../types';
import { places } from '../../stores/placesStore';
import { CategoryPicker } from '../places/CategoryPicker';
import { TagEditor } from '../places/TagEditor';
import { ManualPinPicker } from '../places/ManualPinPicker';
import { MapsShareSheet } from '../places/MapsShareSheet';
import {
  chooseCandidateForRow,
  setManualCoordsForRow,
  setRowDecision,
  updateRowFields,
} from '../../stores/importStore';

/** Indirizzo compatto: dal nome completo tiene le parti utili a riconoscere il posto. */
function shortAddress(candidate: { displayName: string; poiName?: string }): string {
  const parts = candidate.displayName.split(',').map((p) => p.trim()).filter(Boolean);
  const withoutName = candidate.poiName ? parts.filter((p) => p !== candidate.poiName) : parts.slice(1);
  return withoutName.slice(0, 2).join(', ');
}

const STATUS_LABEL: Record<ImportDraftRow['geocodeStatus'], string> = {
  pending: '⏳ in coda',
  searching: '🔎 cerco…',
  found: '✅ trovato',
  ambiguous: '❓ ambiguo',
  not_found: '❌ non trovato',
  skipped: '⏭️ saltato',
};

export function ReviewRow(props: { row: ImportDraftRow }) {
  const { row } = props;
  const [expanded, setExpanded] = useState(false);
  const [manualPinOpen, setManualPinOpen] = useState(false);
  const [gmapsLinkOpen, setGmapsLinkOpen] = useState(false);

  const duplicate = row.possibleDuplicateOf ? places.value.find((p) => p.id === row.possibleDuplicateOf) : undefined;
  const isEtnico = row.suggestedCategories.includes('ristorante_etnico');
  const bestCandidate = row.candidates?.[0];

  return (
    <div class={`review-row decision-${row.decision}`}>
      <div class="review-row-top" onClick={() => setExpanded((v) => !v)}>
        <div>
          <p class="review-row-name">{row.name || '(senza nome)'}</p>
          <p class="review-row-meta">
            {row.city} · {STATUS_LABEL[row.geocodeStatus]}
          </p>
        </div>
        <span class="review-row-chevron">{expanded ? '▲' : '▼'}</span>
      </div>

      {duplicate && (
        <p class="duplicate-inline">⚠️ Forse è già in lista come "{duplicate.name}"</p>
      )}

      {/* Proposta pronta da confermare con un tap: è quello che trasforma una
          riga "ambigua" da tre gesti (espandi, cerca, scegli) a uno solo. */}
      {!row.chosen && bestCandidate && (
        <div class="review-row-suggestion">
          <div class="review-row-suggestion-text">
            <span class="candidate-name">{bestCandidate.poiName ?? bestCandidate.displayName.split(',')[0]}</span>
            <span class="candidate-coords">{shortAddress(bestCandidate)}</span>
          </div>
          <button
            class="btn btn-primary btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              chooseCandidateForRow(row.id, bestCandidate);
            }}
          >
            Usa
          </button>
        </div>
      )}

      {!expanded && (
        <div class="place-card-chips">
          {row.suggestedCategories.map((c) => (
            <span key={c} class="chip-tag">
              {c}
            </span>
          ))}
          {row.suggestedTags.map((t) => (
            <span key={t} class="chip-tag">
              #{t}
            </span>
          ))}
        </div>
      )}

      {expanded && (
        <div class="review-row-editor">
          <div class="field">
            <label>Nome</label>
            <input class="input" value={row.name} onInput={(e) => updateRowFields(row.id, { name: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="field">
            <label>Città</label>
            <input class="input" value={row.city} onInput={(e) => updateRowFields(row.id, { city: (e.target as HTMLInputElement).value })} />
          </div>
          <div class="field">
            <label>Categorie</label>
            <CategoryPicker
              selected={row.suggestedCategories}
              onToggle={(id) =>
                updateRowFields(row.id, {
                  suggestedCategories: row.suggestedCategories.includes(id)
                    ? row.suggestedCategories.filter((c) => c !== id)
                    : [...row.suggestedCategories, id],
                })
              }
            />
          </div>
          {isEtnico && (
            <div class="field">
              <label>Cucina</label>
              <input
                class="input"
                value={row.cuisine ?? ''}
                onInput={(e) => updateRowFields(row.id, { cuisine: (e.target as HTMLInputElement).value })}
              />
            </div>
          )}
          <div class="field">
            <label>Tag</label>
            <TagEditor tags={row.suggestedTags} onChange={(tags) => updateRowFields(row.id, { suggestedTags: tags })} />
          </div>
          <div class="field">
            <label>Note (dal file originale)</label>
            <textarea class="input" rows={2} value={row.notes} onInput={(e) => updateRowFields(row.id, { notes: (e.target as HTMLTextAreaElement).value })} />
          </div>

          {row.geocodeStatus === 'ambiguous' && row.candidates && (
            <div class="field">
              <label>Quale posizione?</label>
              <div class="candidate-list">
                {row.candidates.map((c, i) => (
                  <button key={i} class="candidate-item" onClick={() => chooseCandidateForRow(row.id, c)}>
                    <span class="candidate-name">{c.displayName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {row.chosen && (
            <p class="hint-text">📍 {row.chosen.displayName}</p>
          )}

          <div class="review-row-geo-actions">
            <button class="btn btn-secondary btn-sm" onClick={() => setManualPinOpen(true)}>
              📍 {row.chosen ? 'Cambia' : 'Posiziona'} pin
            </button>
            <button class="btn btn-secondary btn-sm" onClick={() => setGmapsLinkOpen(true)}>
              🔗 Link Maps
            </button>
          </div>
        </div>
      )}

      <div class="review-row-decision">
        <button
          class={`btn btn-sm ${row.decision === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
          disabled={!row.chosen}
          onClick={() => setRowDecision(row.id, 'approved')}
        >
          ✅ Approva
        </button>
        <button
          class={`btn btn-sm ${row.decision === 'discarded' ? 'btn-danger' : 'btn-secondary'}`}
          onClick={() => setRowDecision(row.id, 'discarded')}
        >
          🗑️ Scarta
        </button>
      </div>

      {manualPinOpen && (
        <ManualPinPicker
          initialCenter={row.chosen ? [row.chosen.lng, row.chosen.lat] : undefined}
          onConfirm={(coords, label) => {
            setManualCoordsForRow(row.id, coords, label, 'manual_pin');
            setManualPinOpen(false);
          }}
          onClose={() => setManualPinOpen(false)}
        />
      )}

      {gmapsLinkOpen && (
        <MapsShareSheet
          city={row.city}
          onConfirm={(coords, label) => {
            setManualCoordsForRow(row.id, coords, label, 'gmaps_link');
            setGmapsLinkOpen(false);
          }}
          onClose={() => setGmapsLinkOpen(false)}
        />
      )}
    </div>
  );
}

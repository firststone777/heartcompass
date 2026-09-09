import { signal } from '@preact/signals';
import type { GeocodeCandidate, ImportDraftRow } from '../types';
import { parseImportText, inferCityFromTitle } from '../services/importParser';
import { pickConfidentMatch, searchPlace } from '../services/geocoding';
import { findPossibleDuplicates } from '../services/duplicates';
import { places } from './placesStore';

export type WizardStage = 'source' | 'reviewing' | 'done';

/**
 * Stato della wizard di import in blocco come signal globale (non useState di
 * pagina): la geocodifica di ~150 righe richiede minuti anche rispettando il
 * rate limit, e l'utente deve poter cambiare tab e tornare senza perdere i
 * progressi già fatti.
 */
export const wizardStage = signal<WizardStage>('source');
export const wizardRows = signal<ImportDraftRow[]>([]);
export const wizardProgress = signal({ done: 0, total: 0 });
export const wizardRunning = signal(false);
export const wizardResult = signal<{ imported: number } | null>(null);

let runToken = 0;

export function resetWizard(): void {
  runToken++; // invalida un eventuale ciclo di geocodifica ancora in corso
  wizardStage.value = 'source';
  wizardRows.value = [];
  wizardProgress.value = { done: 0, total: 0 };
  wizardRunning.value = false;
  wizardResult.value = null;
}

function updateRow(id: string, changes: Partial<ImportDraftRow>): void {
  wizardRows.value = wizardRows.value.map((r) => (r.id === id ? { ...r, ...changes } : r));
}

async function resolveOne(row: ImportDraftRow): Promise<void> {
  updateRow(row.id, { geocodeStatus: 'searching' });
  const results = await searchPlace(row.name, row.city);

  // Approva da sola solo quando il match è verificato (nome quasi identico su un
  // vero locale): tutto il resto diventa una scelta da un tap, mai un salvataggio
  // a occhi chiusi su coordinate probabilmente sbagliate.
  const confident = pickConfidentMatch(row.name, row.city, results);

  let changes: Partial<ImportDraftRow>;
  if (confident) {
    changes = {
      geocodeStatus: 'found',
      chosen: confident,
      chosenSource: confident.source === 'photon' ? 'photon' : 'nominatim',
      decision: 'approved',
      candidates: results,
    };
  } else if (results.length > 0) {
    changes = { geocodeStatus: 'ambiguous', candidates: results };
  } else {
    changes = { geocodeStatus: 'not_found' };
  }

  const chosen: GeocodeCandidate | undefined = changes.chosen;
  if (chosen) {
    const dupes = findPossibleDuplicates({ name: row.name, lat: chosen.lat, lng: chosen.lng }, places.value);
    if (dupes.length > 0) changes.possibleDuplicateOf = dupes[0].place.id;
  }

  updateRow(row.id, changes);
}

/** Avvia (o riprende) la geocodifica in sequenza delle righe non ancora risolte. */
export async function startGeocodingQueue(): Promise<void> {
  if (wizardRunning.value) return;
  wizardRunning.value = true;
  const myToken = ++runToken;

  const pending = wizardRows.value.filter((r) => r.geocodeStatus === 'pending');
  wizardProgress.value = { done: wizardRows.value.length - pending.length, total: wizardRows.value.length };

  for (const row of pending) {
    if (myToken !== runToken) return; // la wizard è stata resettata nel frattempo
    await resolveOne(row);
    wizardProgress.value = { ...wizardProgress.value, done: wizardProgress.value.done + 1 };
  }

  wizardRunning.value = false;
}

export function beginReview(rawText: string, defaultCity: string): void {
  const city = inferCityFromTitle(rawText) ?? defaultCity;
  wizardRows.value = parseImportText(rawText, city);
  wizardProgress.value = { done: 0, total: wizardRows.value.length };
  wizardStage.value = 'reviewing';
  void startGeocodingQueue();
}

export function chooseCandidateForRow(rowId: string, candidate: GeocodeCandidate): void {
  const row = wizardRows.value.find((r) => r.id === rowId);
  const dupes = findPossibleDuplicates({ name: row?.name ?? '', lat: candidate.lat, lng: candidate.lng }, places.value);
  updateRow(rowId, {
    chosen: candidate,
    chosenSource: candidate.source === 'photon' ? 'photon' : 'nominatim',
    geocodeStatus: 'found',
    decision: 'approved',
    possibleDuplicateOf: dupes[0]?.place.id,
  });
}

export function setManualCoordsForRow(rowId: string, coords: { lat: number; lng: number }, label: string | undefined, source: 'manual_pin' | 'gmaps_link'): void {
  const candidate: GeocodeCandidate = { lat: coords.lat, lng: coords.lng, displayName: label ?? 'Posizionato a mano', importance: 0 };
  updateRow(rowId, { chosen: candidate, chosenSource: source, geocodeStatus: 'found', decision: 'approved' });
}

export function updateRowFields(rowId: string, changes: Partial<ImportDraftRow>): void {
  updateRow(rowId, changes);
}

export function setRowDecision(rowId: string, decision: ImportDraftRow['decision']): void {
  updateRow(rowId, { decision });
}

export function approveAllFound(): void {
  wizardRows.value = wizardRows.value.map((r) => (r.geocodeStatus === 'found' && r.decision === 'pending' ? { ...r, decision: 'approved' } : r));
}

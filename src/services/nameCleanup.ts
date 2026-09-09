import { normalizeName } from './textSimilarity';

/**
 * Pulizia dei nomi prima di interrogare i geocoder.
 *
 * I nomi presi da una lista scritta a mano contengono cose che i geocoder non
 * digeriscono: la città ripetuta in coda ("Marzapane Roma" quando la città è
 * già Roma), apostrofi tipografici, e parole descrittive che nessuno mette nel
 * nome ufficiale ("Shell bistrot libreria" mentre in OpenStreetMap è solo
 * "Shell Bistrot"). Qui si producono le varianti da provare, dalla più fedele
 * alla più aggressiva.
 */

/** Parole descrittive di categoria: utili all'utente, dannose come chiave di ricerca. */
const GENERIC_WORDS = new Set([
  'ristorante',
  'restaurant',
  'trattoria',
  'bitrattoria',
  'osteria',
  'pizzeria',
  'pizza',
  'pasticceria',
  'forno',
  'panificio',
  'gelateria',
  'enoteca',
  'bottiglieria',
  'libreria',
  'caffetteria',
  'bistrot',
  'bistro',
  'caffe',
  'cafe',
  'coffee',
  'house',
  'bar',
  'lab',
  'store',
  'shop',
  'food',
  'wine',
  'cucina',
  'bottega',
  'agricola',
  'popolare',
  'circolare',
  'eco',
  'mixology',
  'lounge',
  'rooftop',
  'terrace',
  'speakeasy',
  'club',
  'hotel',
]);

const STOPWORDS = new Set(['e', 'and', 'di', 'del', 'della', 'da', 'il', 'la', 'le', 'lo', 'al', 'the', 'de']);

/**
 * Normalizza la punteggiatura e toglie la città se ripetuta in coda al nome:
 * "Marzapane Roma" con città "Roma" diventa "Marzapane", perché la query
 * finale sarebbe altrimenti "Marzapane Roma, Roma".
 */
export function cleanPlaceName(raw: string, city = ''): string {
  let out = raw
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (city) {
    const cityNorm = normalizeName(city);
    const words = out.split(' ');
    if (words.length > 1 && normalizeName(words[words.length - 1]) === cityNorm) {
      out = words.slice(0, -1).join(' ').trim();
    }
  }

  return out;
}

/**
 * Parole davvero distintive di un nome: senza categorie, articoli e pezzi troppo
 * corti. Serve a confrontare "Shell bistrot libreria" con "Shell Bistrot"
 * ragionando sulle parole che contano ("shell") e non sulla lunghezza.
 */
export function distinctiveTokens(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token) && !STOPWORDS.has(token));
}

/**
 * Nome "essenziale": via le parole di categoria e gli articoli, resta la parte
 * distintiva. Ritorna null se non cambia nulla o se resta troppo poco per
 * essere una ricerca sensata.
 */
export function corePlaceName(cleaned: string): string | null {
  const kept = cleaned.split(' ').filter((word) => {
    const norm = normalizeName(word);
    return norm.length > 0 && !GENERIC_WORDS.has(norm) && !STOPWORDS.has(norm);
  });

  const core = kept.join(' ').trim();
  if (core.length < 3) return null;
  return normalizeName(core) === normalizeName(cleaned) ? null : core;
}

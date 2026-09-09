import { describe, expect, it } from 'vitest';
import { cleanPlaceName, corePlaceName } from './nameCleanup';

describe('cleanPlaceName', () => {
  it('toglie la città ripetuta in coda al nome', () => {
    expect(cleanPlaceName('Marzapane Roma', 'Roma')).toBe('Marzapane');
    expect(cleanPlaceName('Caminetto roma', 'Roma')).toBe('Caminetto');
  });

  it('non tocca la città se non è in coda o se è un’altra', () => {
    expect(cleanPlaceName('Roma Sparita', 'Roma')).toBe('Roma Sparita');
    expect(cleanPlaceName('Duomo Milano', 'Roma')).toBe('Duomo Milano');
  });

  it('normalizza apostrofi tipografici e trattini lunghi', () => {
    expect(cleanPlaceName('Leon’s Place Hotel')).toBe("Leon's Place Hotel");
    expect(cleanPlaceName('Bar – Ristoro')).toBe('Bar - Ristoro');
  });

  it('non lascia un nome vuoto quando il nome è solo la città', () => {
    expect(cleanPlaceName('Roma', 'Roma')).toBe('Roma');
  });
});

describe('corePlaceName', () => {
  it('toglie le parole di categoria lasciando la parte distintiva', () => {
    expect(corePlaceName('Shell bistrot libreria')).toBe('Shell');
    expect(corePlaceName('Tra le righe libreria bistrot')).toBe('Tra righe');
    expect(corePlaceName('Bitrattoria Casal Bernocchi')).toBe('Casal Bernocchi');
  });

  it('ritorna null se non c’è nulla da togliere', () => {
    expect(corePlaceName('Retrobottega')).toBeNull();
    expect(corePlaceName('Le Levain')).toBe('Levain');
  });

  it('ritorna null se resterebbe troppo poco', () => {
    expect(corePlaceName('Bar e Caffè')).toBeNull();
  });
});

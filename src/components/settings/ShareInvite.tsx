/**
 * Link dell'app pulito (senza l'eventuale #/pagina corrente), calcolato a
 * runtime: se un domani cambia l'hosting o si aggiunge un dominio proprio,
 * l'invito punta sempre da solo all'indirizzo giusto.
 */
function appUrl(): string {
  return `${location.origin}${location.pathname}`;
}

const INVITE_MESSAGE = 'Sto usando "HeartCompass" per tenere una lista di posti da provare (locali, musei, posti dove andare): prova anche tu, è gratis e funziona anche offline';

export function ShareInvite() {
  const url = appUrl();
  const fullMessage = `${INVITE_MESSAGE} → ${url}`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function handleNativeShare() {
    try {
      await navigator.share({ title: 'HeartCompass', text: INVITE_MESSAGE, url });
    } catch {
      // l'utente ha annullato la condivisione: nessun errore da mostrare
    }
  }

  return (
    <div class="invite-share">
      {canNativeShare && (
        <button class="btn btn-primary btn-block" onClick={handleNativeShare}>
          📤 Condividi (scegli l'app)
        </button>
      )}
      <a class="btn btn-secondary btn-block" href={`https://wa.me/?text=${encodeURIComponent(fullMessage)}`} target="_blank" rel="noopener">
        💬 Invita via WhatsApp
      </a>
      <a
        class="btn btn-secondary btn-block"
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(INVITE_MESSAGE)}`}
        target="_blank"
        rel="noopener"
      >
        ✈️ Invita via Telegram
      </a>
      <a
        class="btn btn-secondary btn-block"
        href={`mailto:?subject=${encodeURIComponent('HeartCompass')}&body=${encodeURIComponent(fullMessage)}`}
      >
        ✉️ Invita via email
      </a>
    </div>
  );
}

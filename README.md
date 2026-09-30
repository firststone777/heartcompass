# HeartCompass

Archivio personale di posti da visitare (locali, alberghi, attrazioni, musei…), pensato per l'uso dal telefono mentre si è in giro per una città. Funziona offline, non ha account/login, non ha un backend: tutti i dati vivono solo sul tuo dispositivo (IndexedDB del browser).

## Costo

Zero, per sempre. Nessuna API key a pagamento, nessuna carta di credito, nessun piano con soglie di fatturazione:

- **Mappa**: tile vettoriali di [OpenFreeMap](https://openfreemap.org) (gratis per sempre, nessuna key, nessun limite di piano).
- **Geocoding**: [Photon](https://photon.komoot.io) e [Nominatim](https://nominatim.org), entrambi gratuiti, senza API key e costruiti sui dati di OpenStreetMap. Photon è interrogato per primo perché è pensato per la ricerca *per nome* dei locali (ed è più rapido); Nominatim resta per gli indirizzi e come rete di sicurezza. Il codice rispetta le rispettive policy: chiamate in coda (max 1/secondo su Nominatim), risultati in cache locale, nessuna ricerca identica ripetuta.
- **Storage**: IndexedDB del browser (locale, nessun database gestito).
- **Hosting**: GitHub Pages (statico, gratis).

## Uso dell'app

### Aggiungere un posto (flusso rapido)

Tab **Aggiungi** → scrivi il nome (e opzionalmente la città, precompilata con l'ultima usata) → **Salva**. Da qui:

- Se un risultato combacia col nome in modo attendibile, il posto viene salvato subito con quelle coordinate: due tap in tutto.
- Se i risultati sono più d'uno o non abbastanza sicuri, te li mostra e scegli quello giusto (è così che si gestiscono gli omonimi).
- Se **non trova nulla**, puoi posizionare il pin a mano su una mappa (trascina la mappa sotto il segnaposto fisso al centro) oppure incollare un link di Google Maps.

Dopo il salvataggio finisci sulla scheda del posto, dove puoi aggiungere categorie, tag, stato, voto e note con calma — non è obbligatorio farlo subito.

### La scheda di un posto

Ogni posto ha un pulsante **🧭 Naviga**: apre Google Maps in navigazione verso quelle coordinate, con l'app nativa se installata (sia su iOS che su Android) o il browser altrimenti.

Puoi modificare in qualsiasi momento: nome, città, posizione (pulsante "Modifica pin"), categorie (un posto può averne più di una), tag liberi, stato (**da provare / visitato / scartato**), e per i visitati voto (1-5), data e nota.

### Mappa

Tab **Mappa**: tutti i posti come pin colorati per categoria (ogni categoria ha un colore scelto liberamente e un'emoji propria, così l'identità non dipende mai solo dal colore), filtrabili con lo stesso pannello filtri della lista.

Un tap su un pin apre un'**anteprima in basso** (nome, categorie, distanza, "Naviga", "Apri scheda") senza lasciare la mappa: si possono confrontare due o tre posti della stessa zona senza perdere l'inquadratura. Se si apre la scheda completa, la mappa **ricorda centro e zoom** e al ritorno si riparte esattamente da dove si era — e la scheda ha un pulsante "‹ Indietro" esplicito, oltre allo swipe di sistema.

Il colore di una categoria si assegna già al momento dell'aggiunta rapida (menu a tendina "Categoria" nella schermata Aggiungi): il pin sulla mappa nasce già del colore giusto, senza dover passare dalla scheda del posto. Si possono comunque aggiungere altre categorie in un secondo momento dalla scheda.

### Vicino a me

Tab **Vicino**: attiva la geolocalizzazione e mostra i posti ordinati per distanza reale (in metri/km), con un filtro a raggio regolabile. Finché la schermata è aperta la posizione viene seguita in continuo (`watchPosition`): distanze e ordinamento si aggiornano da soli mentre cammini, e in cima vedi quanto è fresco il fix e con che precisione. Quando esci dalla schermata il tracciamento si ferma, per non consumare batteria.

Se la posizione è nota, viene usata anche come aiuto nella ricerca di nuovi posti (vedi sotto).

### Ricerca e filtri

In cima alla lista: testo libero (cerca in nome, note e tag) + pulsante **Filtri** per categoria, tag, stato, città e distanza, tutti combinabili tra loro e condivisi tra Lista, Mappa e Vicino a me.

### Import in blocco

**Impostazioni → Import in blocco** (oppure tab Aggiungi → non presente in tabbar per non affollarla, ma sempre raggiungibile da Impostazioni). Puoi:

1. Usare il pulsante **"Usa la lista iniziale di Roma"**, che importa il file `Locali Roma.txt` originale già incluso nell'app.
2. Caricare un tuo file `.txt` nello stesso formato (intestazioni di sezione + elenco puntato con `◦`, note tra parentesi).
3. Incollare il testo direttamente.

Il parser riconosce automaticamente le sezioni (Colazione, Pranzo/cena, Aperitivo…) e mappa parole chiave nel testo su categorie e tag (fermate metro, "anche pranzo", cucine etniche tra parentesi, ecc.). Poi geocodifica ogni riga **in sequenza** rispettando i limiti dei servizi (per ~140 posti servono un paio di minuti) — puoi cambiare tab e tornare, il progresso resta.

Prima di interrogare i geocoder i nomi vengono ripuliti: via la città ripetuta in coda ("Marzapane Roma" quando la città è già Roma), apostrofi tipografici normalizzati, e in seconda battuta via anche le parole di categoria ("Shell bistrot libreria" → "Shell", che è come il posto sta in OpenStreetMap).

Alla fine (o anche durante) arrivi alla **revisione**: ogni riga mostra cosa ha trovato il geocoder, un'eventuale somiglianza con un posto già salvato, e i controlli per approvare, correggere (nome, città, categorie, tag, posizione) o scartare. Solo le righe **approvate** vengono salvate quando premi "Importa N posti". Le righe ambigue o non trovate non vanno mai perse: restano nella revisione finché non le risolvi o le scarti tu esplicitamente.

Le righe non risolte automaticamente mostrano già **la proposta migliore con nome e indirizzo e un pulsante "Usa"**: confermarla è un tap solo, senza aprire la riga. L'approvazione automatica invece è deliberatamente severa — scatta solo se il nome combacia (anche in forma accorciata) *e* l'oggetto trovato è davvero un locale, non un'area geografica. Senza quest'ultimo controllo "Sugo Ponte Milvio" finirebbe sul ponte e "Bitrattoria Casal Bernocchi" in mezzo al quartiere: meglio un tap in più che una coordinata sbagliata salvata in silenzio.

### Invitare altre persone

**Impostazioni → Invita amici**: pulsanti pronti per condividere il link dell'app via WhatsApp, Telegram, email (più un pulsante di condivisione nativa del telefono, se il browser lo supporta). Chi apre il link ha una propria lista indipendente sul proprio dispositivo — non è una lista condivisa, ognuno ha i propri dati. Per confrontare o unire due liste si usa l'export/import JSON descritto sotto.

### Backup ed export

**Impostazioni → Backup e portabilità**:

- **Esporta backup JSON**: tutti i posti e le categorie, in un formato che l'app stessa sa reimportare (utile per spostarsi su un altro telefono o come backup periodico). Reimportare lo stesso file è sicuro: sovrascrive le voci con lo stesso id invece di duplicarle.
- **Esporta CSV**: per aprire i dati in un foglio di calcolo (categorie e tag multipli sono separati da `;` dentro la cella).

### PWA

Da un browser mobile, "Aggiungi a schermata Home" installa l'app con icona propria e funzionamento a schermo intero.

> **Attenzione, vale soprattutto su iPhone**: l'app installata sulla Home e il sito aperto nel browser hanno **archivi dati separati**, pur essendo lo stesso indirizzo. I posti salvati da una parte non compaiono dall'altra. Conviene scegliere un solo contesto (di solito l'app installata, anche perché è più al riparo dalle pulizie automatiche di Safari) e usare sempre quello. In **Impostazioni → Dove sono salvati i dati** l'app dice in quale dei due ti trovi; per unire due elenchi basta un export JSON da un lato e un reimport dall'altro (i posti con lo stesso id vengono aggiornati, non duplicati). Una volta aperta almeno una volta online, consultazione, ricerca e navigazione funzionano anche offline: serve rete solo per geocodificare un posto nuovo o scaricare i tile della mappa mai visti prima (che poi restano in cache).

## Come aggiungere una categoria nuova

Nessun tocco al codice: **Impostazioni → Categorie → Aggiungi categoria**. Scegli un'emoji, un nome e un colore a piacere (selettore colore nativo, qualunque tonalità): quel colore è quello con cui apparirà il pin sulla mappa. Le categorie di serie si possono rinominare e ricolorare ma non eliminare (per non rompere il mapping automatico dell'import); quelle che aggiungi tu si possono anche eliminare — i posti che le usavano restano, semplicemente perdono quel tag di categoria.

## Come faccio il backup

**Impostazioni → Backup e portabilità → Esporta backup JSON**. Tienilo da parte (es. in un cloud storage personale, o mandalo a te stesso): per ripristinarlo su questo o un altro dispositivo usa **"Reimporta un backup JSON"** nella stessa schermata.

## Cosa fare se il geocoding non trova un posto

Prima di arrendersi, la ricerca per nome prova da sola più strategie, in quest'ordine: **vicino a dove sei** (se la posizione è attiva), poi "nome + città", poi una ricerca strutturata per punto di interesse, poi il nome ristretto al riquadro della città. Quando i risultati sono più d'uno — il caso degli **omonimi** — te li mostra tutti e scegli tu; se sei sul posto, il più vicino a te viene proposto per primo. La tua posizione influenza l'ordine solo quando c'entra davvero: se sei a Roma e cerchi un posto a Milano, vince la rilevanza, non la vicinanza.

Se comunque non trova nulla, il posto si salva lo stesso con una delle alternative che l'app propone da sola (o dal pulsante "Modifica pin" nella scheda, per correggere una posizione sbagliata):

1. **Incolla da Google Maps**: apri il posto in Google Maps, tocca **Condividi** e incolla qui quello che copi. Funzionano sia i link estesi (`https://www.google.com/maps/place/...`) sia i **link brevi** `maps.app.goo.gl`, che l'app prova a espandere; se l'espansione non riesce (è l'unico pezzo che dipende da un servizio esterno gratuito), ricade sul nome e indirizzo contenuti nel messaggio condiviso e li geocodifica, mostrandoti i risultati da confermare.
2. **Posiziona il pin a mano**: si apre una mappa con un segnaposto fisso al centro, muovi la mappa sotto di esso finché non è nel punto giusto, poi conferma.

Su Android, con la PWA installata, puoi anche saltare il copia-incolla: da Google Maps tocca **Condividi → HeartCompass** e l'app si apre già sulla schermata di aggiunta con nome e posizione pronti.

In nessun caso un posto viene salvato con coordinate inventate: se non geocodifichi né posizioni il pin, semplicemente non si salva ancora (per l'aggiunta rapida) o la riga resta "da risolvere" (nell'import in blocco).

## Sviluppo locale

```bash
npm install              # installa le dipendenze
npm run dev              # avvia in locale (http://localhost:5173)
npm test                 # esegue i test (parser import, geocoding, distanza, filtri, CSV…)
npm run generate-icons   # rigenera le icone PWA in public/icons da assets/icon-source.png
npm run build            # build di produzione in dist/
npm run preview          # serve la build di produzione in locale, per un ultimo controllo
```

Il file `public/seed/locali-roma.txt` è il tuo `Locali Roma.txt` originale: è servito staticamente dall'app stessa (pulsante "Usa la lista iniziale di Roma" nell'import), non serve un import da riga di comando.

## Deploy su GitHub Pages

Setup una tantum (questa parte richiede per forza il tuo account GitHub, non è automatizzabile da uno script):

1. Crea un repository vuoto su GitHub (es. `heartcompass`).
2. `git remote add origin https://github.com/<tuo-utente>/<repo>.git`
3. Nelle impostazioni del repository → **Pages** → **Source**: scegli **GitHub Actions**.

Da qui in poi è tutto automatico:

```bash
git push -u origin main
```

Il workflow in `.github/workflows/deploy.yml` builda e pubblica ad ogni push su `main`. In alternativa, per un deploy manuale senza GitHub Actions:

```bash
npm run deploy   # build + pubblica dist/ sul branch gh-pages
```

## Stack tecnico (perché)

- **Vite + Preact + TypeScript**: build veloce, bundle minimo, zero backend necessario per compilare a statico puro.
- **@preact/signals**: stato reattivo senza boilerplate (niente Redux/Context da orchestrare per 6 schermate).
- **Dexie (IndexedDB)**: unico storage del browser che regge centinaia di posti con query indicizzate e sopravvive alla chiusura del browser.
- **MapLibre GL + OpenFreeMap**: mappa vettoriale gratis per sempre, senza key.
- **Nominatim**: unico geocoder realmente gratuito senza key, con cache locale e throttling per rispettarne la policy.
- **vite-plugin-pwa**: manifest e service worker generati in build, per l'installabilità e l'uso offline.
- Nessuna libreria per CSV, similarità testo, o routing: per la dimensione dell'app scriverle a mano (poche decine di righe ciascuna) costa meno di una dipendenza in più.

## Limiti noti

- Il geocoding automatico trova ciò che esiste in OpenStreetMap: un locale piccolo che nessuno ha ancora mappato non è trovabile da nessun geocoder, per quanto si affini la ricerca (verificato interrogando direttamente i dati OSM: diversi posti della lista non ci sono proprio). È normale, ed è proprio per questo che esistono la revisione dell'import, l'incolla-da-Google-Maps e il pin manuale.
- Non esiste un "conferma tutto" per le proposte non verificate, e non è una dimenticanza: sui dati reali i quasi-omonimi sono frequenti ("Pasticceria Mono" contro *Pasticceria Regoli*, "Bar della cometa" contro *Bar della Pineta*), quindi una conferma in blocco salverebbe silenziosamente coordinate sbagliate. Ogni proposta si conferma con un tap, con nome e indirizzo sotto gli occhi.
- L'espansione dei link brevi `maps.app.goo.gl` passa da un servizio pubblico gratuito di terze parti (unshorten.me), perché il browser non può seguire quel redirect da solo e l'app non ha un server proprio: è un servizio a cortesia, con limiti di frequenza, e se non risponde l'app ricade automaticamente sul testo condiviso o sul pin manuale.
- La sincronizzazione fra dispositivi non è automatica: il meccanismo "gratis, facoltativo, disattivato di default" richiesto è l'export/import JSON manuale — niente account né infrastruttura da mantenere.

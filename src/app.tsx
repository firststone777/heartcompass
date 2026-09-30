import { useEffect, useState } from 'preact/hooks';
import { route } from './router';
import { TabBar } from './components/layout/TabBar';
import { ListPage } from './pages/ListPage';
import { MapPage } from './pages/MapPage';
import { NearbyPage } from './pages/NearbyPage';
import { AddPage } from './pages/AddPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';
import { PlacePage } from './pages/PlacePage';
import { initCategories } from './stores/categoriesStore';
import { reloadPlaces } from './stores/placesStore';
import { captureShareFromUrl, pendingShare } from './stores/shareStore';
import { requestPersistentStorage } from './utils/platform';
import { navigate } from './router';

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Avvio: seed categorie al primo utilizzo + primo caricamento dei posti dal DB locale.
    captureShareFromUrl();
    // best-effort: chiede al browser di non buttare via i dati sotto pressione di spazio
    void requestPersistentStorage();
    Promise.all([initCategories(), reloadPlaces()]).then(() => {
      // se l'app è stata aperta condividendo un posto da un'altra app, si va dritti all'aggiunta
      if (pendingShare.value) navigate('aggiungi');
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <div class="boot-screen">
        <p>HeartCompass…</p>
      </div>
    );
  }

  const { page, param } = route.value;

  return (
    <>
      <main class={`app-main ${page === 'mappa' ? 'app-main-flush' : ''}`}>
        {page === 'lista' && <ListPage />}
        {page === 'mappa' && <MapPage />}
        {page === 'vicino' && <NearbyPage />}
        {page === 'aggiungi' && <AddPage />}
        {page === 'import' && <ImportPage />}
        {page === 'impostazioni' && <SettingsPage />}
        {page === 'posto' && param && <PlacePage id={param} />}
      </main>
      <TabBar />
    </>
  );
}

import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Config di build: app statica pura, nessun target server-side.
export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['seed/locali-roma.txt'],
      manifest: {
        name: 'HeartCompass',
        short_name: 'HeartCompass',
        description: 'Archivio personale di posti da visitare, con mappa e navigazione offline',
        theme_color: '#2a78d6',
        background_color: '#fcfcfb',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Con la PWA installata su Android, "Condividi" dentro Google Maps può
        // mandare nome/indirizzo/link direttamente qui: l'app apre l'aggiunta
        // già compilata invece di far copiare e incollare a mano.
        share_target: {
          action: '.',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        // I tile della mappa e le risposte di Nominatim sono gestiti dai loro
        // rispettivi servizi con cache dedicata nel codice; qui mettiamo in
        // cache solo gli asset dell'app per il funzionamento offline completo.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  // Necessario per il deploy su GitHub Pages (repo servito da un sottopercorso).
  base: './',
});

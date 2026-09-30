// Genera le icone PWA a partire dall'immagine in assets/icon-source.png.
// Niente librerie grafiche pesanti o servizi online: solo pngjs, puro JS.
//
// L'immagine sorgente ha lo sfondo trasparente, ma le icone no, e per due
// motivi diversi: su iOS la trasparenza di un'icona viene resa nera, e le
// icone "maskable" di Android vengono ritagliate a cerchio, quindi devono
// avere il fondo pieno fino al bordo e il soggetto dentro la zona sicura.
import { PNG } from 'pngjs';
import { mkdirSync, createWriteStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, '..', 'assets', 'icon-source.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT_DIR, { recursive: true });

/** Fondo scuro: la bussola è dorata e su chiaro si perderebbe. */
const BACKGROUND = { r: 0x11, g: 0x18, b: 0x26 };
/** Sotto questa opacità il pixel è considerato alone/rumore, non soggetto. */
const ALPHA_NOISE_FLOOR = 24;

const source = PNG.sync.read(readFileSync(SOURCE));

/** Riquadro del soggetto: serve a centrarlo davvero, ignorando i margini trasparenti. */
function contentBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = image.data[((image.width * y + x) << 2) + 3];
      if (alpha < ALPHA_NOISE_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return { x: 0, y: 0, width: image.width, height: image.height };

  // il soggetto va tenuto quadrato, altrimenti si deforma
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const side = Math.max(width, height);
  return {
    x: minX - Math.floor((side - width) / 2),
    y: minY - Math.floor((side - height) / 2),
    width: side,
    height: side,
  };
}

const bounds = contentBounds(source);

/**
 * Ridimensiona il riquadro del soggetto nella dimensione richiesta e lo
 * compone sul fondo pieno. La media dei pixel è fatta in alfa premoltiplicato:
 * altrimenti i pixel trasparenti "sporcherebbero" i bordi con il loro colore.
 */
function renderIcon(size, contentRatio) {
  const png = new PNG({ width: size, height: size });
  const target = Math.round(size * contentRatio);
  const offset = Math.round((size - target) / 2);
  const scale = bounds.width / target;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      let r = BACKGROUND.r;
      let g = BACKGROUND.g;
      let b = BACKGROUND.b;

      const insideContent = x >= offset && x < offset + target && y >= offset && y < offset + target;
      if (insideContent) {
        const srcX0 = bounds.x + Math.floor((x - offset) * scale);
        const srcY0 = bounds.y + Math.floor((y - offset) * scale);
        const srcX1 = bounds.x + Math.floor((x - offset + 1) * scale);
        const srcY1 = bounds.y + Math.floor((y - offset + 1) * scale);

        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let samples = 0;

        for (let sy = srcY0; sy < Math.max(srcY1, srcY0 + 1); sy++) {
          for (let sx = srcX0; sx < Math.max(srcX1, srcX0 + 1); sx++) {
            samples++;
            if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
            const s = ((source.width * sy + sx) << 2);
            const alpha = source.data[s + 3] / 255;
            sumR += source.data[s] * alpha;
            sumG += source.data[s + 1] * alpha;
            sumB += source.data[s + 2] * alpha;
            sumA += alpha;
          }
        }

        if (samples > 0 && sumA > 0) {
          const coverage = sumA / samples;
          const colorR = sumR / sumA;
          const colorG = sumG / sumA;
          const colorB = sumB / sumA;
          r = colorR * coverage + BACKGROUND.r * (1 - coverage);
          g = colorG * coverage + BACKGROUND.g * (1 - coverage);
          b = colorB * coverage + BACKGROUND.b * (1 - coverage);
        }
      }

      png.data[idx] = Math.round(r);
      png.data[idx + 1] = Math.round(g);
      png.data[idx + 2] = Math.round(b);
      png.data[idx + 3] = 255; // sempre opaco: richiesto per maskable e per apple-touch-icon
    }
  }

  return png;
}

function writePng(png, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(OUT_DIR, filename);
    const stream = createWriteStream(filePath);
    png.pack().pipe(stream);
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

const targets = [
  // icone normali: un filo di margine perché il bordo non tocchi il quadrato
  { size: 192, filename: 'icon-192.png', contentRatio: 0.9 },
  { size: 512, filename: 'icon-512.png', contentRatio: 0.9 },
  // maskable: il soggetto sta nella zona sicura, il ritaglio a cerchio non lo tocca
  { size: 512, filename: 'icon-maskable-512.png', contentRatio: 0.68 },
];

for (const t of targets) {
  const png = renderIcon(t.size, t.contentRatio);
  const filePath = await writePng(png, t.filename);
  console.log('generata', filePath);
}

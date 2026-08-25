/**
 * Reencuadra la variante oscura del hero para que ocupe exactamente el mismo
 * lienzo y la misma caja de contenido que `aventa-hero.png`. Así el swap por
 * tema no mueve ni redimensiona la ilustración.
 *
 * Uso: node scripts/build-hero-dark-asset.mjs <origen.png>
 */
import { mkdtemp, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const LIGHT = 'public/brand/aventa-hero.png';
const OUT = 'public/brand/aventa-hero-dark.png';

const source = process.argv[2];
if (!source) {
  console.error('Falta la ruta de la imagen oscura de origen');
  process.exit(1);
}

async function contentBox(file) {
  const { info } = await sharp(file).trim().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    left: Math.abs(info.trimOffsetLeft ?? 0),
    top: Math.abs(info.trimOffsetTop ?? 0),
  };
}

const lightMeta = await sharp(LIGHT).metadata();
const canvas = { width: lightMeta.width, height: lightMeta.height };
const box = await contentBox(LIGHT);

const trimmedDark = await sharp(source).trim().png().toBuffer();
const fitted = await sharp(trimmedDark)
  .resize({
    width: box.width,
    height: box.height,
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

const tmp = await mkdtemp(path.join(tmpdir(), 'aventa-hero-'));
const staged = path.join(tmp, 'hero-dark.png');

await sharp({
  create: {
    width: canvas.width,
    height: canvas.height,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: fitted, left: box.left, top: box.top }])
  .png({ compressionLevel: 9 })
  .toFile(staged);

await copyFile(staged, OUT);

console.log(
  `Lienzo ${canvas.width}x${canvas.height} · contenido ${box.width}x${box.height} en (${box.left},${box.top}) → ${OUT}`
);

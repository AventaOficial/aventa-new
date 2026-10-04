/**
 * Clasifica el borde de una foto de producto para decidir el fondo del marco.
 *
 * - `plate`: el borde es un color uniforme (estudio blanco, gris o negro). El marco
 *   usa ese mismo color y la foto se funde con la tarjeta, sin pozo oscuro ni recuadro.
 * - `transparent`: PNG con fondo transparente. Se apoya en una superficie clara para
 *   que productos oscuros no desaparezcan en dark mode.
 * - `scene`: foto con contexto (persona, ambiente). Se rellena con una copia difuminada.
 */
export type EdgeTone =
  | { kind: 'plate'; rgb: [number, number, number] }
  | { kind: 'transparent' }
  | { kind: 'scene' };

/** Lado del lienzo de muestreo; 16×16 basta para leer el borde y cuesta ~1 KB. */
export const EDGE_SAMPLE_SIZE = 16;

/** Distancia máxima (suma de |ΔR|+|ΔG|+|ΔB|) para considerar un pixel del mismo fondo. */
const SAME_COLOR_DISTANCE = 36;
/** Proporción de pixeles del borde que deben coincidir para tratarlo como fondo uniforme. */
const UNIFORM_RATIO = 0.82;
const OPAQUE_ALPHA = 200;
const TRANSPARENT_ALPHA = 16;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** `data` es RGBA fila por fila, como `ImageData.data`. */
export function classifyEdgePixels(data: ArrayLike<number>, width: number, height: number): EdgeTone {
  if (width < 2 || height < 2 || data.length < width * height * 4) return { kind: 'scene' };

  const opaque: [number, number, number][] = [];
  let transparent = 0;
  let total = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      total++;
      if (a <= TRANSPARENT_ALPHA) {
        transparent++;
      } else if (a >= OPAQUE_ALPHA) {
        opaque.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }

  if (transparent / total >= 0.5) return { kind: 'transparent' };
  if (opaque.length / total < UNIFORM_RATIO) return { kind: 'scene' };

  const ref: [number, number, number] = [
    median(opaque.map((p) => p[0])),
    median(opaque.map((p) => p[1])),
    median(opaque.map((p) => p[2])),
  ];
  const close = opaque.filter(
    (p) => Math.abs(p[0] - ref[0]) + Math.abs(p[1] - ref[1]) + Math.abs(p[2] - ref[2]) <= SAME_COLOR_DISTANCE,
  ).length;

  return close / total >= UNIFORM_RATIO ? { kind: 'plate', rgb: ref } : { kind: 'scene' };
}

/**
 * Cómo se enmarca la foto.
 * - `plate`: fondo uniforme medido; el marco toma ese color.
 * - `neutral`: aún sin medir, PNG transparente o imagen que el navegador no deja leer (otra
 *   tienda sin CORS). La gran mayoría son fotos de estudio claras: una placa clara las integra
 *   y evita el recuadro blanco «flotando» sobre un pozo oscuro.
 * - `scene`: foto con contexto medida; se rellena con su copia difuminada.
 * - `cover`: superficies que muestran escenas y aceptan recorte.
 */
export type OfferFrameMode = 'plate' | 'neutral' | 'scene' | 'cover';

export function offerFrameMode(edge: EdgeTone | null, fit: 'contain' | 'cover'): OfferFrameMode {
  if (fit === 'cover') return 'cover';
  if (edge?.kind === 'scene') return 'scene';
  if (edge?.kind === 'plate') return 'plate';
  return 'neutral';
}

/** Lee el borde de una imagen ya cargada. Devuelve null si el navegador no permite leerla (CORS). */
export function readEdgeTone(img: HTMLImageElement): EdgeTone | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = EDGE_SAMPLE_SIZE;
    canvas.height = EDGE_SAMPLE_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, EDGE_SAMPLE_SIZE, EDGE_SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, EDGE_SAMPLE_SIZE, EDGE_SAMPLE_SIZE);
    return classifyEdgePixels(data, EDGE_SAMPLE_SIZE, EDGE_SAMPLE_SIZE);
  } catch {
    return null;
  }
}

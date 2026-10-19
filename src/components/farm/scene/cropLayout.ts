import type { CropType, IrrigationSystem } from '@/types/farm';

/**
 * Where the beds, rows and plants of the 3D scene go. One pure function feeds the crop models and
 * the irrigation models, so lateral lines and emitters always line up with the plants they serve.
 * Everything is deterministic: the same setup always produces the same field.
 */

export type RenderQuality = 'high' | 'balanced' | 'lite';

export interface CropSpec {
  id: CropType;
  label: string;
  /** Distance between plants along a line, metres. */
  spacing: number;
  /** Plant lines per bed (staggered when more than one). */
  lines: number;
  /** Distance between lines in one bed, metres. */
  lineGap: number;
  /** Typical height of a mature plant, metres (high-wire tomato and cucumber reach the wire, 3 to 4 m). */
  nominalHeight: number;
  /**
   * How many more plants than the base cap this crop may draw. Low crops (strawberry, lettuce) cost few
   * instances per plant and look wrong when thinned out, so they get a larger share.
   */
  density: number;
  /** Whether plants are trained up strings from an overhead wire. */
  trellis: boolean;
  bedColor: string;
  /** Height of the raised bed, metres (gerbera is grown on high beds, lettuce on low ones). */
  bedHeight: number;
  /** Plastic mulch laid on the bed, if any: black, or silver-on-black for capsicum. */
  mulch: string | null;
}

export const CROP_SPECS: Record<CropType, CropSpec> = {
  tomato: { id: 'tomato', label: 'Tomato', spacing: 0.5, lines: 1, lineGap: 0, nominalHeight: 3.4, density: 1.5, trellis: true, bedColor: '#4a3020', bedHeight: 0.28, mulch: '#17181b' },
  capsicum: { id: 'capsicum', label: 'Capsicum', spacing: 0.45, lines: 2, lineGap: 0.4, nominalHeight: 1.0, density: 1.2, trellis: false, bedColor: '#4a3020', bedHeight: 0.3, mulch: '#b8bdc3' },
  cucumber: { id: 'cucumber', label: 'Cucumber', spacing: 0.4, lines: 1, lineGap: 0, nominalHeight: 3.2, density: 1.5, trellis: true, bedColor: '#4a3020', bedHeight: 0.28, mulch: '#17181b' },
  lettuce: { id: 'lettuce', label: 'Lettuce', spacing: 0.28, lines: 3, lineGap: 0.28, nominalHeight: 0.22, density: 2.5, trellis: false, bedColor: '#46301f', bedHeight: 0.18, mulch: null },
  strawberry: { id: 'strawberry', label: 'Strawberry', spacing: 0.3, lines: 2, lineGap: 0.4, nominalHeight: 0.25, density: 4, trellis: false, bedColor: '#46301f', bedHeight: 0.35, mulch: '#101114' },
  gerbera: { id: 'gerbera', label: 'Gerbera', spacing: 0.36, lines: 2, lineGap: 0.38, nominalHeight: 0.6, density: 2, trellis: false, bedColor: '#5a3b24', bedHeight: 0.4, mulch: null },
};

export const BED_WIDTH = 0.9;
/** Default (tomato) bed height; each crop sets its own in CropSpec.bedHeight. */
export const BED_HEIGHT = 0.28;
export const AISLE_WIDTH = 0.75;
export const TABLE_HEIGHT = 0.85;
export const CHANNEL_HEIGHT = 0.07;
export const CHANNEL_WIDTH = 0.11;
export const NFT_LINES = 3;
export const NFT_LINE_GAP = 0.27;
const MAX_ROWS = 10;
const PLANT_CAP: Record<RenderQuality, number> = { high: 320, balanced: 200, lite: 100 };

/** Most plants one crop may draw at a quality level (per-line rounding and staggering can add a few). */
export function plantCap(spec: CropSpec, quality: RenderQuality): number {
  return Math.round(PLANT_CAP[quality] * spec.density);
}

/**
 * Thinnest radius a wire, string or pipe is drawn with. Lite renders without antialiasing at a low
 * pixel ratio, so a 3 mm string breaks up into dots; drawing it a little fatter keeps it a line.
 */
const MIN_RADIUS: Record<RenderQuality, number> = { high: 0, balanced: 0.0035, lite: 0.008 };

export function visibleRadius(radius: number, quality: RenderQuality): number {
  return Math.max(radius, MIN_RADIUS[quality]);
}

export interface PlantSlot {
  x: number;
  z: number;
  row: number;
  line: number;
  /** Size variation, about 0.88 to 1.1. */
  scale: number;
  /** Rotation about the vertical axis. */
  yaw: number;
  /** Stable 0..1 value for colour and detail choices. */
  seed: number;
}

export interface CropLayout {
  mode: 'soil' | 'nft';
  spec: CropSpec;
  rowX: number[];
  rowCount: number;
  /** Plants run from zMin to zMax along every line. */
  zMin: number;
  zMax: number;
  rowLength: number;
  lineOffsets: number[];
  plants: PlantSlot[];
  /** Height at which plants start: top of the soil bed, or top of the NFT channel. */
  baseY: number;
  /** Shrinks tall crops so they fit under the gutter. */
  heightScale: number;
  /** Height of the overhead wire for trellised crops. */
  wireY: number;
}

/** Deterministic 0..1 value from three numbers. */
export function noise(a: number, b: number, c: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface LayoutInput {
  width: number;
  length: number;
  gutterHeight: number;
  crop: CropType;
  irrigation: IrrigationSystem;
  quality: RenderQuality;
}

export function buildCropLayout({ width, length, gutterHeight, crop, irrigation, quality }: LayoutInput): CropLayout {
  const spec = CROP_SPECS[crop] ?? CROP_SPECS.tomato;
  const mode = irrigation === 'hydroponic-nft' ? 'nft' : 'soil';

  const usableWidth = width * 0.86;
  const usableLength = length * 0.88;
  const rowCount = clamp(Math.floor((usableWidth - BED_WIDTH) / (BED_WIDTH + AISLE_WIDTH)) + 1, 1, MAX_ROWS);
  const pitch = rowCount > 1 ? Math.max(BED_WIDTH + AISLE_WIDTH, (usableWidth - BED_WIDTH) / (rowCount - 1)) : 0;
  const rowX = Array.from({ length: rowCount }, (_, i) => (i - (rowCount - 1) / 2) * pitch);

  const lines = mode === 'nft' ? NFT_LINES : spec.lines;
  const lineGap = mode === 'nft' ? NFT_LINE_GAP : spec.lineGap;
  const lineOffsets = Array.from({ length: lines }, (_, k) => (k - (lines - 1) / 2) * lineGap);
  const plantSpacing = mode === 'nft' ? Math.max(spec.spacing, 0.3) : spec.spacing;

  const naturalPerLine = Math.floor(usableLength / plantSpacing) + 1;
  const cappedPerLine = Math.floor(plantCap(spec, quality) / (rowCount * lines));
  const perLine = clamp(Math.min(naturalPerLine, cappedPerLine), 3, Math.max(3, naturalPerLine));
  const step = usableLength / (perLine - 1);
  const zMin = -usableLength / 2;
  const zMax = usableLength / 2;

  const plants: PlantSlot[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let line = 0; line < lines; line += 1) {
      for (let i = 0; i < perLine; i += 1) {
        // Staggered lines sit half a step apart, so neighbouring plants never touch.
        const stagger = line % 2 === 1 ? step / 2 : 0;
        const z = zMin + i * step + stagger;
        if (z > zMax + 1e-6) continue;
        const jitterX = (noise(row + 1, line + 1, i + 0.3) - 0.5) * 0.04;
        const jitterZ = (noise(row + 1, line + 1, i + 0.9) - 0.5) * 0.06;
        plants.push({
          x: rowX[row] + lineOffsets[line] + jitterX,
          z: z + jitterZ,
          row,
          line,
          scale: 0.88 + noise(row + 1, i + 1, line + 1.4) * 0.22,
          yaw: noise(row + 2, i + 3, line + 2.1) * Math.PI * 2,
          seed: noise(row + 5, i + 7, line + 3.3),
        });
      }
    }
  }

  const baseY = mode === 'nft' ? TABLE_HEIGHT + CHANNEL_HEIGHT : spec.bedHeight;
  // The high wire runs just under the trusses (about 3.5 to 4 m in a 4 to 4.5 m gutter house), and
  // trained crops grow up to it; other crops only need to clear the gutter.
  const wireY = Math.max(baseY + 0.6, Math.min(gutterHeight - 0.5, 4.2));
  const headroom = spec.trellis && mode === 'soil' ? Math.max(0.3, wireY - baseY - 0.1) : Math.max(0.3, gutterHeight - 0.3 - baseY);

  return {
    mode,
    spec,
    rowX,
    rowCount,
    zMin,
    zMax,
    rowLength: usableLength,
    lineOffsets,
    plants,
    baseY,
    heightScale: clamp(headroom / spec.nominalHeight, 0.4, 1),
    wireY,
  };
}

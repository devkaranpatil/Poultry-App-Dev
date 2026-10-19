import * as THREE from 'three';
import type { CoverMaterial, StructureMaterial } from '@/types/greenhouse';
import type { RenderQuality } from './cropLayout';
import type { PipeProfile } from './structureGeometry';

/**
 * Materials and small procedural textures for the building. Every factory returns a new material:
 * the build-in and swap transitions fade cover opacity per instance, so covers are never shared
 * between an outgoing and an incoming model. Callers dispose what they create.
 */

export interface FrameLook {
  color: string;
  metalness: number;
  roughness: number;
  profile: PipeProfile;
  /** Bamboo poles are much thicker than steel pipe. */
  thickness: number;
  bamboo: boolean;
}

// The scene has no environment map, so a highly metallic surface has nothing to reflect and renders
// black. Moderate metalness keeps the steel/aluminium difference readable.
export const FRAME_LOOK: Record<StructureMaterial, FrameLook> = {
  'gi-steel': { color: '#8b949d', metalness: 0.5, roughness: 0.38, profile: 'round', thickness: 1, bamboo: false },
  aluminium: { color: '#e3e9ef', metalness: 0.45, roughness: 0.24, profile: 'box', thickness: 0.9, bamboo: false },
  bamboo: { color: '#b88a4a', metalness: 0.02, roughness: 0.82, profile: 'round', thickness: 1.7, bamboo: true },
};

/**
 * Pipe radii in metres for each role, from the NHB-style sizes (columns 76 mm, bottom chord 60 mm,
 * purlins 48 mm, arches 42 mm, bracing 33 mm), before the material's thickness factor.
 */
export const MEMBER_RADIUS = {
  column: 0.038,
  chord: 0.03,
  purlin: 0.024,
  arch: 0.021,
  brace: 0.017,
  cable: 0.006,
} as const;

export function createFrameMaterial(structure: StructureMaterial): THREE.MeshStandardMaterial {
  const look = FRAME_LOOK[structure];
  return new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
}

let netTextures: Partial<Record<'shade' | 'insect', THREE.Texture>> = {};

/**
 * How each net is drawn: `cells` holes across one tile of `tile` metres, threads `thread` pixels wide
 * on a 256 px canvas, and the alpha of the holes and the threads. A 40-mesh insect net has holes well
 * under a millimetre, far below a pixel at any viewing distance, so it is drawn as a faint, even haze
 * with only a low-contrast weave; a knitted shade net has visible holes a few millimetres across.
 */
const NET_WEAVE = {
  insect: { tile: 0.08, cells: 64, thread: 1, hole: 0.2, yarn: 0.62 },
  shade: { tile: 0.1, cells: 32, thread: 3, hole: 0.42, yarn: 1 },
} as const;

/**
 * A tileable net alpha mask with mipmaps and anisotropic filtering, so the weave averages out to an
 * even translucency with distance instead of breaking into moire. UVs are metres (see sweptSheet).
 */
function netTexture(kind: 'shade' | 'insect'): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const cached = netTextures[kind];
  if (cached) return cached;
  const weave = NET_WEAVE[kind];
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const grey = (alpha: number) => {
    const v = Math.round(alpha * 255);
    return `rgb(${v},${v},${v})`;
  };
  context.fillStyle = grey(weave.hole);
  context.fillRect(0, 0, size, size);
  const pitch = size / weave.cells;
  for (let i = 0; i < weave.cells; i += 1) {
    // Threads vary a little in density, as real yarn does, so no single line stands out.
    context.fillStyle = grey(weave.yarn * (0.88 + 0.12 * Math.abs(Math.sin(i * 12.9898))));
    context.fillRect(Math.round(i * pitch), 0, weave.thread, size);
    context.fillRect(0, Math.round(i * pitch), size, weave.thread);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / weave.tile, 1 / weave.tile);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // The renderer clamps this to what the GPU supports.
  texture.anisotropy = 8;
  netTextures[kind] = texture;
  return texture;
}

/** For tests: forget cached textures. */
export function resetStructureTextures() {
  Object.values(netTextures).forEach((texture) => texture?.dispose());
  netTextures = {};
}

/**
 * Roof and wall cover. Each cover must read as itself at every quality, even without textures:
 *  - glass: almost clear with a cool tint and a sharp highlight (the glazing bars do the rest)
 *  - UV film: milky and slightly green, the most opaque of the three
 *  - insect net: a flat, matte white-grey haze, see-through
 *  - shade net: dark green knitted mesh
 * Film and glass are physically based (glass transmits on high); nets are plain translucent.
 */
export function createCoverMaterial(cover: CoverMaterial, quality: RenderQuality): THREE.Material {
  const common = { transparent: true, side: THREE.DoubleSide, depthWrite: false } as const;
  const textured = quality !== 'lite';
  switch (cover) {
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        ...common,
        color: '#e4f3fb',
        opacity: quality === 'high' ? 0.12 : 0.14,
        roughness: 0.04,
        metalness: 0.15,
        transmission: quality === 'high' ? 0.92 : 0,
        thickness: 0.004,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        ior: 1.5,
      });
    case 'shade-net':
      return new THREE.MeshStandardMaterial({
        ...common,
        color: '#2d4a30',
        opacity: textured ? 0.8 : 0.62,
        roughness: 0.95,
        alphaMap: textured ? netTexture('shade') : null,
      });
    case 'insect-net':
      return new THREE.MeshStandardMaterial({
        ...common,
        color: '#eef1f1',
        // With the weave the average alpha is about 0.37 times this; without it the haze is even.
        opacity: textured ? 0.75 : 0.26,
        roughness: 1,
        alphaMap: textured ? netTexture('insect') : null,
      });
    case 'uv-polyfilm':
    default:
      return new THREE.MeshPhysicalMaterial({
        ...common,
        color: '#cfe5d2',
        opacity: 0.6,
        roughness: 0.42,
        metalness: 0,
        // No transmission: it would let the film look as clear as glass. Diffusing film is milky.
        clearcoat: quality === 'lite' ? 0 : 0.25,
      });
  }
}

/** The 40-mesh insect net behind roll-up curtains and in ridge vents. */
export function createInsectNetMaterial(quality: RenderQuality): THREE.MeshStandardMaterial {
  return createCoverMaterial('insect-net', quality) as THREE.MeshStandardMaterial;
}

/** Polyfilm curtain (the roll-up side curtain, door film), always film whatever the main cover is. */
export function createCurtainMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#d8ead9', transparent: true, opacity: 0.6, roughness: 0.45, side: THREE.DoubleSide, depthWrite: false });
}

let padTexture: THREE.Texture | null = null;

/** Cellulose cooling pad: brown honeycomb of crossed flutes. */
export function coolingPadTexture(): THREE.Texture | null {
  if (padTexture) return padTexture;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#a8743c';
  context.fillRect(0, 0, 64, 64);
  context.strokeStyle = '#6f4a22';
  context.lineWidth = 3;
  for (let i = -64; i < 128; i += 12) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + 40, 64);
    context.stroke();
    context.beginPath();
    context.moveTo(i + 40, 0);
    context.lineTo(i, 64);
    context.stroke();
  }
  padTexture = new THREE.CanvasTexture(canvas);
  padTexture.wrapS = THREE.RepeatWrapping;
  padTexture.wrapT = THREE.RepeatWrapping;
  padTexture.colorSpace = THREE.SRGBColorSpace;
  return padTexture;
}

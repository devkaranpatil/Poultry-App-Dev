import * as THREE from 'three';
import type { FrameMaterial, RoofSheet } from '@/types/farm';
import type { RenderQuality } from './shedLayout';

/**
 * Materials and small procedural textures for the shed. Every factory returns a new material: the build-in and
 * swap transitions fade opacity per material, so an outgoing and an incoming part never share one. Callers dispose
 * what they create; the textures are shared and cached.
 */

export interface MemberLook {
  color: string;
  /** Half the member's thickness. */
  size: number;
  round: boolean;
  metalness: number;
  roughness: number;
}

export interface FrameLook {
  post: MemberLook;
  /** Trusses, rafters and purlins. */
  member: MemberLook;
  /** Bamboo frames are lashed rafters with a tie beam, not trusses. */
  truss: boolean;
}

// The scene has no environment map, so very metallic surfaces would render black: metalness stays moderate.
export const FRAME_LOOK: Record<FrameMaterial, FrameLook> = {
  'steel-truss': {
    post: { color: '#7d8790', size: 0.05, round: false, metalness: 0.45, roughness: 0.45 },
    member: { color: '#86909a', size: 0.022, round: false, metalness: 0.45, roughness: 0.45 },
    truss: true,
  },
  'rcc-pillars': {
    post: { color: '#b9b4aa', size: 0.115, round: false, metalness: 0, roughness: 0.92 },
    member: { color: '#5d646b', size: 0.024, round: false, metalness: 0.4, roughness: 0.5 },
    truss: true,
  },
  'bamboo-wood': {
    post: { color: '#a8834c', size: 0.055, round: true, metalness: 0, roughness: 0.85 },
    member: { color: '#b8915a', size: 0.035, round: true, metalness: 0, roughness: 0.85 },
    truss: false,
  },
};

export function createMemberMaterial(look: MemberLook): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
}

export interface SheetLook {
  color: string;
  metalness: number;
  roughness: number;
  /** Drawn thickness in metres: sheets are thin, PUF panels and thatch are not. */
  thickness: number;
  /** The corrugation or rib pitch in metres, and its profile; thatch is straw. */
  pitch: number;
  profile: 'wave' | 'trapezoid' | 'straw';
}

export const SHEET_LOOK: Record<RoofSheet, SheetLook> = {
  'gi-sheet': { color: '#c9cfd4', metalness: 0.3, roughness: 0.45, thickness: 0.012, pitch: 0.076, profile: 'wave' },
  galvalume: { color: '#dde2e6', metalness: 0.35, roughness: 0.35, thickness: 0.012, pitch: 0.2, profile: 'trapezoid' },
  'fibre-cement': { color: '#a9a59c', metalness: 0, roughness: 0.9, thickness: 0.02, pitch: 0.146, profile: 'wave' },
  'puf-panel': { color: '#eef0ef', metalness: 0.15, roughness: 0.5, thickness: 0.06, pitch: 0.25, profile: 'trapezoid' },
  thatch: { color: '#c6a15b', metalness: 0, roughness: 1, thickness: 0.2, pitch: 0.5, profile: 'straw' },
};

const textures = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: [number, number], draw: (context: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size[0];
  canvas.height = size[1];
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context, size[0], size[1]);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  textures.set(key, texture);
  return texture;
}

const grey = (value: number) => {
  const v = Math.round(Math.min(Math.max(value, 0), 1) * 255);
  return `rgb(${v},${v},${v})`;
};

/** A repeatable pseudo-random sequence for the canvas textures. */
function sequence(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/**
 * One corrugation (or rib) down the texture's height, as light and shade. BoxGeometry's top face carries v along
 * the shed, so repeating the texture once per pitch lines the ridges up with the slope.
 */
function sheetTexture(profile: SheetLook['profile']): THREE.Texture | null {
  if (profile === 'straw') {
    return canvasTexture('straw', [128, 128], (context, w, h) => {
      context.fillStyle = '#bf9a55';
      context.fillRect(0, 0, w, h);
      const random = sequence(7);
      for (let i = 0; i < 420; i += 1) {
        const x = random() * w;
        const y = random() * h;
        const tone = 0.55 + random() * 0.45;
        context.strokeStyle = `rgba(${Math.round(150 * tone + 60)},${Math.round(115 * tone + 40)},${Math.round(55 * tone + 20)},0.9)`;
        context.lineWidth = 1 + random();
        context.beginPath();
        context.moveTo(x, y);
        // Straw lies down the slope (u), so the strands run across the canvas.
        context.lineTo(x + 18 + random() * 22, y + (random() - 0.5) * 6);
        context.stroke();
      }
    });
  }
  return canvasTexture(`sheet-${profile}`, [4, 64], (context, w, h) => {
    for (let y = 0; y < h; y += 1) {
      const t = y / h;
      // Gentle shading: strong stripes alias into dark moiré at a distance.
      const light = profile === 'wave' ? 0.86 + 0.14 * Math.sin(t * Math.PI * 2) : t < 0.18 ? 1 : t < 0.26 ? 0.8 : t < 0.92 ? 0.92 : 0.82;
      context.fillStyle = grey(light);
      context.fillRect(0, y, w, 1);
    }
  });
}

/**
 * The roof sheet, for a sheet `slope` metres down the roof and `length` metres along the shed. Lite draws plain
 * colour; the other qualities add the corrugation as colour and bump.
 */
export function createSheetMaterial(sheet: RoofSheet, quality: RenderQuality, length: number, slope: number): THREE.MeshStandardMaterial {
  const look = SHEET_LOOK[sheet];
  const material = new THREE.MeshStandardMaterial({ color: look.color, metalness: look.metalness, roughness: look.roughness });
  if (quality === 'lite') return material;
  const base = sheetTexture(look.profile);
  if (!base) return material;
  const texture = base.clone();
  texture.needsUpdate = true;
  if (look.profile === 'straw') texture.repeat.set(slope / 0.6, length / 0.6);
  // A corrugation finer than about 12 cm is drawn at 12 cm: finer still only shimmers on screen.
  else texture.repeat.set(1, length / Math.max(look.pitch, 0.12));
  texture.colorSpace = THREE.SRGBColorSpace;
  material.map = texture;
  material.bumpMap = texture;
  material.bumpScale = look.profile === 'straw' ? 2 : 0.4;
  material.userData.ownTextures = [texture];
  return material;
}

/** Disposes a material and any texture clones made for it. */
export function disposeMaterial(material: THREE.Material) {
  for (const texture of (material.userData.ownTextures as THREE.Texture[] | undefined) ?? []) texture.dispose();
  material.dispose();
}

/**
 * Welded wire mesh (the open sides): galvanised wire on a 25 mm grid. Wire that fine is far below a pixel, so it
 * draws as an even grey haze with a faint weave, readable at any distance without moiré. UVs are metres.
 */
export function createMeshMaterial(quality: RenderQuality): THREE.MeshStandardMaterial {
  const textured = quality !== 'lite';
  const alpha = textured
    ? canvasTexture('wire', [64, 64], (context, w, h) => {
        context.fillStyle = grey(0.12);
        context.fillRect(0, 0, w, h);
        context.fillStyle = grey(0.95);
        for (let i = 0; i < 8; i += 1) {
          context.fillRect(i * 8, 0, 1, h);
          context.fillRect(0, i * 8, w, 1);
        }
      })
    : null;
  if (alpha) alpha.repeat.set(5, 5);
  return new THREE.MeshStandardMaterial({
    color: '#9aa3a8',
    metalness: 0.3,
    roughness: 0.6,
    transparent: true,
    opacity: textured ? 0.9 : 0.28,
    alphaMap: alpha,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** HDPE tarpaulin curtain: the yellow sheet most Indian open sheds let down in winter and at night. */
export function createCurtainMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#d9b440', roughness: 0.75, side: THREE.DoubleSide });
}

/** Plastered and whitewashed brick: the low walls, closed walls and the anteroom. */
export function createWallMaterial(quality: RenderQuality): THREE.MeshStandardMaterial {
  const texture =
    quality === 'lite'
      ? null
      : canvasTexture('plaster', [64, 64], (context, w, h) => {
          context.fillStyle = '#ebe6da';
          context.fillRect(0, 0, w, h);
          const random = sequence(3);
          for (let i = 0; i < 260; i += 1) {
            context.fillStyle = `rgba(120,110,95,${0.04 + random() * 0.07})`;
            context.fillRect(Math.floor(random() * w), Math.floor(random() * h), 2, 2);
          }
        });
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ color: texture ? '#ffffff' : '#e4ddcf', roughness: 0.95, map: texture, side: THREE.DoubleSide });
}

/** The concrete plinth and floor apron. */
export function createConcreteMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#b8b3a8', roughness: 0.95 });
}

/** Deep litter: rice husk or wood shavings, 3 to 5 inches deep. UVs are metres. */
export function createLitterMaterial(quality: RenderQuality): THREE.MeshStandardMaterial {
  const texture =
    quality === 'lite'
      ? null
      : canvasTexture('litter', [128, 128], (context, w, h) => {
          context.fillStyle = '#c9a66b';
          context.fillRect(0, 0, w, h);
          const random = sequence(11);
          for (let i = 0; i < 900; i += 1) {
            context.fillStyle = random() < 0.33 ? 'rgba(120,88,45,0.55)' : 'rgba(230,205,150,0.6)';
            context.fillRect(Math.floor(random() * w), Math.floor(random() * h), 2 + Math.floor(random() * 3), 1);
          }
        });
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ color: texture ? '#ffffff' : '#c9a66b', roughness: 1, map: texture });
}

/** Cellulose cooling pad: a brown honeycomb of crossed flutes. */
export function coolingPadTexture(): THREE.Texture | null {
  const texture = canvasTexture('pad', [64, 64], (context) => {
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
  });
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** For tests: forget cached textures. */
export function resetShedTextures() {
  textures.forEach((texture) => texture.dispose());
  textures.clear();
}

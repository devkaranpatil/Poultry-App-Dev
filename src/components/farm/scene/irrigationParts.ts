import * as THREE from 'three';
import type { IrrigationSystem } from '@/types/farm';
import { InstanceSet } from './instancing';
import { CHANNEL_HEIGHT, CHANNEL_WIDTH, TABLE_HEIGHT, visibleRadius, type CropLayout, type RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { createMotionMaterial } from './sceneMaterials';

/**
 * The pipes, emitters and moving water of each irrigation system, built from the same layout as the
 * crops so every lateral line and nozzle sits where the plants are. Water is animated on the GPU.
 *
 *  drip       grey PVC main and sub-main, black LLDPE laterals on each bed with drippers, drops falling
 *  sprinkler  risers in the aisles with sprinkler heads that throw turning arcs of water
 *  fogger     overhead line with misting nozzles and drifting fog
 *  hydroponic raised tables of open channels with a pump loop and water flowing along them
 */

export interface IrrigationPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  set: InstanceSet;
}

export interface IrrigationParts {
  system: IrrigationSystem;
  parts: IrrigationPart[];
  /** Where the pump house stands, outside the back wall. */
  head: { x: number; z: number };
  dispose: () => void;
}

export interface IrrigationContext {
  layout: CropLayout;
  halfWidth: number;
  halfLength: number;
  gutterHeight: number;
  quality: RenderQuality;
}

/** Rigid PVC for mains and sub-mains (grey, as sold in India; blue for the sprinkler and NFT mains). */
const PVC = '#8e959c';
const BLUE_PIPE = '#2563eb';
/** Drip laterals are black LLDPE (UV-stabilised with carbon black), and so are the online drippers. */
const LATERAL = '#17181a';
const DRIPPER = '#2a2c30';
const STEEL = '#9aa4b2';

/** x positions of the walkways between beds (or beside the only bed). */
export function aisleX(layout: CropLayout): number[] {
  if (layout.rowCount === 1) return [layout.rowX[0] + 0.9];
  return layout.rowX.slice(0, -1).map((x, i) => (x + layout.rowX[i + 1]) / 2);
}

export function headPosition(halfWidth: number, halfLength: number) {
  return { x: -halfWidth + 1.2, z: -halfLength - 1.1 };
}

/** Thin cylinders laid along an axis. All coordinates are scene metres. */
function pipeZ(set: InstanceSet, x: number, y: number, z0: number, z1: number, radius: number, color: string) {
  set.add([x, y, (z0 + z1) / 2], [radius, Math.abs(z1 - z0), radius], color, 0, Math.PI / 2);
}
function pipeX(set: InstanceSet, x0: number, x1: number, y: number, z: number, radius: number, color: string) {
  set.add([(x0 + x1) / 2, y, z], [radius, Math.abs(x1 - x0), radius], color, 0, 0, Math.PI / 2);
}
function pipeY(set: InstanceSet, x: number, y0: number, y1: number, z: number, radius: number, color: string) {
  set.add([x, (y0 + y1) / 2, z], [radius, Math.abs(y1 - y0), radius], color);
}

/** Positions along [from, to] spaced about `spacing` apart, but never more than `maxCount`. */
function along(from: number, to: number, spacing: number, maxCount: number): number[] {
  const natural = Math.max(1, Math.floor((to - from) / spacing) + 1);
  const count = Math.max(2, Math.min(natural, maxCount));
  return Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
}

export function buildIrrigationParts(system: IrrigationSystem, ctx: IrrigationContext): IrrigationParts {
  const materials: THREE.Material[] = [];
  const parts: IrrigationPart[] = [];
  const { layout, halfWidth, halfLength, gutterHeight, quality } = ctx;
  /** Laterals, hangers and drop pipes are thin; lite draws them at least a visible line wide. */
  const thin = (radius: number) => visibleRadius(radius, quality);
  const head = headPosition(halfWidth, halfLength);
  const headerZ = layout.zMin - 0.25;
  const budget = quality === 'high' ? 1 : quality === 'balanced' ? 0.6 : 0.3;

  const part = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material): InstanceSet => {
    materials.push(material);
    const set = new InstanceSet();
    parts.push({ name: `${system}-${name}`, geometry, material, set });
    return set;
  };
  const plastic = (roughness = 0.5, metalness = 0) => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness, metalness });
  const water = (kind: 'fall' | 'spray' | 'mist') => {
    if (kind === 'fall') return createMotionMaterial('fall', { color: '#60a5fa', transparent: true, opacity: 0.85, roughness: 0.15 }, { speed: 0.9, range: 0.22 });
    if (kind === 'spray') return createMotionMaterial('spray', { color: '#7dd3fc', transparent: true, opacity: 0.75, roughness: 0.2 }, { speed: 0.8, range: 1.6, rise: 0.5, spin: 0.9 });
    return createMotionMaterial('mist', { color: '#e0f2fe', transparent: true, opacity: 0.32, roughness: 1, depthWrite: false }, { speed: 0.45, range: 0.5, rise: 1.2 });
  };

  /** Pipe from the pump house to the header, then along the header across all rows. */
  const supply = (pipes: InstanceSet, y: number, radius: number, color: string) => {
    pipeZ(pipes, head.x, y, head.z, headerZ, radius, color);
    const xs = [...layout.rowX.map((x) => x - 0.14), ...layout.rowX.map((x) => x + 0.14), head.x];
    pipeX(pipes, Math.min(...xs), Math.max(...xs), y, headerZ, radius, color);
  };

  if (system === 'drip') {
    const pipes = part('pipes', geo.cylinder(), plastic(0.4));
    const emitters = part('emitters', geo.cylinder(), plastic(0.5));
    const drops = part('drops', geo.droplet(), water('fall'));
    supply(pipes, 0.12, 0.028, PVC);
    const tapeY = layout.baseY + 0.014;
    const spacing = Math.max(0.3, (layout.rowLength * layout.rowCount * 2) / (700 * budget));
    const emitterZ = along(layout.zMin, layout.zMax, spacing, Math.floor(120 * budget) + 8);
    layout.rowX.forEach((x) => {
      for (const side of [-0.14, 0.14]) {
        const tapeX = x + side;
        pipeY(pipes, tapeX, 0.12, tapeY, headerZ, thin(0.008), LATERAL);
        pipeZ(pipes, tapeX, tapeY, headerZ, layout.zMax, thin(0.008), LATERAL);
        emitterZ.forEach((z, i) => {
          emitters.add([tapeX, tapeY + 0.012, z], [thin(0.011), 0.03, thin(0.011)], DRIPPER);
          if (i % 2 === (side > 0 ? 0 : 1)) drops.add([tapeX, tapeY - 0.01, z], [0.016, 0.026, 0.016], '#93c5fd');
        });
      }
    });
  }

  if (system === 'sprinkler') {
    const pipes = part('pipes', geo.cylinder(), plastic(0.5));
    const heads = part('heads', geo.cylinderRound(), plastic(0.35, 0.6));
    const spray = part('spray', geo.droplet(), water('spray'));
    supply(pipes, 0.12, 0.03, BLUE_PIPE);
    // Risers stand in the walkways, with the heads just above the crop canopy.
    const canopy = layout.baseY + layout.spec.nominalHeight * layout.heightScale;
    const riserHeight = Math.min(gutterHeight - 0.4, Math.max(1.1, canopy + 0.3));
    const aisles = aisleX(layout);
    const headCap = Math.max(4, Math.floor((60 * budget) / Math.max(1, aisles.length)));
    const headZ = along(layout.zMin + 0.8, layout.zMax - 0.8, 3.5, headCap);
    const jets = quality === 'lite' ? 8 : 14;
    aisles.forEach((x) => {
      pipeY(pipes, x, 0.12, 0.05, headerZ, 0.02, BLUE_PIPE);
      pipeZ(pipes, x, 0.05, headerZ, layout.zMax, 0.02, BLUE_PIPE);
      headZ.forEach((z) => {
        pipeY(pipes, x, 0.05, riserHeight, z, 0.016, '#64748b');
        heads.add([x, riserHeight + 0.03, z], [0.05, 0.07, 0.05], STEEL);
        for (let k = 0; k < jets; k += 1) {
          spray.add([x, riserHeight + 0.08, z], 0.024, '#bae6fd', (k / jets) * Math.PI * 2);
        }
      });
    });
  }

  if (system === 'fogger') {
    const pipes = part('pipes', geo.cylinder(), plastic(0.5));
    const nozzles = part('nozzles', geo.cylinderRound(), plastic(0.3, 0.7));
    const plumes = part(
      'plumes',
      geo.cone(),
      new THREE.MeshStandardMaterial({ color: '#dbeafe', transparent: true, opacity: 0.1, roughness: 1, side: THREE.DoubleSide, depthWrite: false })
    );
    const mist = part('mist', geo.sphere(), water('mist'));
    supply(pipes, 0.12, 0.028, '#475569');
    // Fogger lines hang below the trusses, a little under the gutter.
    const lineY = Math.max(1.8, gutterHeight - 0.45);
    const aisles = aisleX(layout);
    const nozzleCap = Math.max(4, Math.floor((40 * budget) / Math.max(1, aisles.length)));
    const nozzleZ = along(layout.zMin + 0.8, layout.zMax - 0.8, 2.5, nozzleCap);
    const puffs = quality === 'lite' ? 4 : 8;
    aisles.forEach((x) => {
      pipeY(pipes, x, 0.12, lineY, headerZ, 0.016, '#475569');
      pipeZ(pipes, x, lineY, headerZ, layout.zMax, 0.014, '#64748b');
      along(layout.zMin, layout.zMax, 4, 12).forEach((z) => pipeY(pipes, x, lineY, gutterHeight - 0.02, z, thin(0.004), '#94a3b8'));
      nozzleZ.forEach((z) => {
        nozzles.add([x, lineY - 0.03, z], [0.014, 0.05, 0.014], '#b08d57');
        plumes.add([x, lineY - 0.5, z], [0.32, 0.95, 0.32], '#dbeafe');
        for (let k = 0; k < puffs; k += 1) mist.add([x, lineY - 0.06, z], 0.05, '#e0f2fe', (k / puffs) * Math.PI * 2);
      });
    });
  }

  if (system === 'hydroponic-nft') {
    const pipes = part('pipes', geo.cylinder(), plastic(0.5));
    const legs = part('legs', geo.cylinder(), plastic(0.35, 0.6));
    const floor = part('channel-floors', geo.box(), plastic(0.45));
    const walls = part('channel-walls', geo.box(), plastic(0.45));
    const flow = part(
      'water',
      geo.box(),
      createMotionMaterial('flow', { color: '#2f9bd8', roughness: 0.2, metalness: 0.1, emissive: '#0b3b57', emissiveIntensity: 0.6 })
    );
    const supplyY = TABLE_HEIGHT - 0.12;
    supply(pipes, supplyY, 0.022, BLUE_PIPE);
    const channelLength = layout.rowLength + 0.2;
    const braceZ = along(layout.zMin, layout.zMax, 3, 14);

    layout.rowX.forEach((x) => {
      for (const side of [-0.46, 0.46]) {
        braceZ.forEach((z) => pipeY(legs, x + side, 0, TABLE_HEIGHT - 0.03, z, 0.022, STEEL));
        pipeZ(legs, x + side, TABLE_HEIGHT - 0.03, layout.zMin, layout.zMax, 0.014, STEEL);
      }
      braceZ.forEach((z) => pipeX(legs, x - 0.46, x + 0.46, TABLE_HEIGHT - 0.03, z, thin(0.012), STEEL));

      for (const offset of layout.lineOffsets) {
        const cx = x + offset;
        floor.add([cx, TABLE_HEIGHT + 0.004, 0], [CHANNEL_WIDTH, 0.008, channelLength], '#f5f5f4');
        walls.add([cx - CHANNEL_WIDTH / 2, TABLE_HEIGHT + CHANNEL_HEIGHT / 2, 0], [0.008, CHANNEL_HEIGHT, channelLength], '#f5f5f4');
        walls.add([cx + CHANNEL_WIDTH / 2, TABLE_HEIGHT + CHANNEL_HEIGHT / 2, 0], [0.008, CHANNEL_HEIGHT, channelLength], '#f5f5f4');
        flow.add([cx, TABLE_HEIGHT + 0.014, 0], [CHANNEL_WIDTH * 0.72, 0.012, channelLength - 0.1], '#2f9bd8');
        pipeY(pipes, cx, supplyY, TABLE_HEIGHT + 0.02, layout.zMin - 0.08, thin(0.007), BLUE_PIPE);
      }
    });

    // Return gutter at the low end, then a pipe back to the reservoir along the left wall.
    const returnZ = layout.zMax + 0.25;
    const xs = layout.rowX.flatMap((x) => layout.lineOffsets.map((o) => x + o));
    const returnX = Math.min(-halfWidth + 0.5, Math.min(...layout.rowX) - 0.75);
    const returnY = TABLE_HEIGHT - 0.2;
    pipeX(pipes, Math.min(...xs, returnX), Math.max(...xs), returnY, returnZ, 0.045, '#6b7280');
    xs.forEach((cx) => pipeY(pipes, cx, returnY, TABLE_HEIGHT + 0.01, layout.zMax + 0.06, thin(0.008), '#6b7280'));
    pipeY(pipes, returnX, 0.1, returnY, returnZ, 0.045, '#6b7280');
    pipeZ(pipes, returnX, 0.1, head.z, returnZ, 0.04, '#6b7280');
  }

  return { system, parts, head, dispose: () => materials.forEach((material) => material.dispose()) };
}

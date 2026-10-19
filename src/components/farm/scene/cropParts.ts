import * as THREE from 'three';
import type { CropType } from '@/types/farm';
import { InstanceSet, addSegment } from './instancing';
import { BED_WIDTH, noise, visibleRadius, type CropLayout, type RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { createMotionMaterial } from './sceneMaterials';

/**
 * Builds the instanced parts of one crop: every stem, leaf, fruit and flower of every plant in the
 * field. A part is one geometry drawn many times, so a whole crop is only a handful of draw calls.
 */

export interface CropPart {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  set: InstanceSet;
}

export interface CropParts {
  crop: CropType;
  parts: CropPart[];
  dispose: () => void;
}

const pick = <T,>(list: readonly T[], value: number): T => list[Math.min(list.length - 1, Math.floor(value * list.length))];

type PartFactory = (
  name: string,
  geometry: THREE.BufferGeometry,
  options?: { roughness?: number; amp?: number; doubleSide?: boolean; metalness?: number }
) => { part: CropPart; set: InstanceSet };
type Builder = (layout: CropLayout, quality: RenderQuality, make: PartFactory) => CropPart[];

const STEM = '#4f8a30';
const STRING = '#ece8da';

/** Height of a trained vine: its nominal height, scaled to the house, and always just under the wire. */
function vineHeight(layout: CropLayout, scale: number): number {
  return Math.min(layout.spec.nominalHeight * scale * layout.heightScale, layout.wireY - layout.baseY - 0.08);
}

/**
 * Tomato on the high-wire system: one vine up a string to the wire (3 to 4 m), leaves all the way up
 * (thinned out below the lowest truss, as growers strip them), and trusses of fruit ripening from the
 * bottom: red low down, turning in the middle, green higher up.
 */
const tomato: Builder = (layout, quality, make) => {
  const stems = make('stems', geo.cylinder());
  const strings = make('strings', geo.cylinder(), { amp: 0 });
  const leaves = make('leaves', geo.leafLens(), { doubleSide: true });
  const fruit = make('fruit', geo.sphere(), { roughness: 0.32 });
  const base = layout.baseY;
  const stringHeight = layout.wireY - base;
  const stringRadius = visibleRadius(0.002, quality);
  const leafCount = quality === 'lite' ? 11 : quality === 'balanced' ? 15 : 18;
  const trusses = quality === 'lite' ? 3 : 5;
  const LEAF = ['#3f8f2e', '#4aa036', '#368028', '#58a83c'];
  const RIPE = ['#d7261e', '#c81d25', '#e03a2c'];
  const TURNING = ['#f2692b', '#e8812f', '#d7261e'];
  const GREEN = ['#6fae3a', '#7cba45', '#5f9b34'];

  for (const p of layout.plants) {
    const w = p.scale;
    const height = vineHeight(layout, p.scale);
    const stem = visibleRadius(0.011 * w, quality);
    stems.set.add([p.x, base + height / 2, p.z], [stem, height, stem], STEM);
    strings.set.add([p.x + 0.02, base + stringHeight / 2, p.z], [stringRadius, stringHeight, stringRadius], STRING);

    // Leaves start a little above the bed (the lowest are stripped) and get younger and smaller near the top.
    const leafStart = Math.min(0.45, height * 0.2);
    for (let k = 0; k < leafCount; k += 1) {
      const t = k / (leafCount - 1);
      const yaw = p.yaw + k * 2.4;
      const length = (0.46 - 0.18 * t) * w * (0.9 + 0.2 * noise(p.seed * 50, k, 1));
      leaves.set.add(
        [p.x + Math.sin(yaw) * 0.02, base + leafStart + (height - leafStart) * t, p.z + Math.cos(yaw) * 0.02],
        length,
        pick(LEAF, noise(p.seed * 50, k, 2)),
        yaw,
        0.15 + 0.35 * t
      );
    }

    // A truss about every 0.3 m from 0.5 m up: the bottom ones ripe, then turning, then green.
    for (let k = 0; k < trusses; k += 1) {
      const y = base + Math.min(height * 0.75, 0.5 + 0.3 * k);
      const angle = p.yaw * 0.5 + k * 2.1 + 1;
      const cx = p.x + Math.sin(angle) * 0.09;
      const cz = p.z + Math.cos(angle) * 0.09;
      const count = k < 2 ? 5 : 4;
      const stage = k / Math.max(1, trusses - 1);
      for (let j = 0; j < count; j += 1) {
        const a = (j / count) * Math.PI * 2;
        const radius = (stage < 0.6 ? 0.034 : 0.03) * w;
        const palette = stage < 0.3 ? RIPE : stage < 0.6 ? TURNING : GREEN;
        fruit.set.add(
          [cx + Math.cos(a) * 0.035 * w, y - 0.035 * (j % 3), cz + Math.sin(a) * 0.035 * w],
          [radius, radius * 0.92, radius],
          pick(palette, noise(p.seed * 50, j + k, 3))
        );
      }
    }
  }
  return [stems.part, strings.part, leaves.part, fruit.part];
};

/** Capsicum: a bushy plant that forks into branches, glossy leaves, and blocky peppers in mixed colours. */
const capsicum: Builder = (layout, quality, make) => {
  const stems = make('stems', geo.cylinder());
  const leaves = make('leaves', geo.leafLens(), { doubleSide: true, roughness: 0.45 });
  const fruit = make('fruit', geo.pepper(), { roughness: 0.28, doubleSide: true });
  const stakes = make('stakes', geo.cylinder(), { amp: 0.01 });
  const base = layout.baseY;
  const leafCount = quality === 'lite' ? 7 : 12;
  const fruitCount = quality === 'lite' ? 3 : 5;
  const LEAF = ['#2f7a2b', '#37862f', '#2a6e27'];
  const PEPPER = ['#cc2a1f', '#cc2a1f', '#f0b323', '#e8801c', '#4c9b32'];

  for (const p of layout.plants) {
    const s = p.scale * layout.heightScale;
    const w = p.scale * (0.55 + 0.45 * layout.heightScale);
    const height = 0.85 * s;
    stems.set.add([p.x, base + height / 2, p.z], [0.016 * w, height, 0.016 * w], STEM);
    // A bamboo stake beside every plant, standing a little above it.
    const stake = height + 0.25;
    const stakeRadius = visibleRadius(0.007, quality);
    stakes.set.add([p.x + 0.05, base + stake / 2 - 0.05, p.z + 0.03], [stakeRadius, stake, stakeRadius], '#c9a66b');

    for (const side of [0, Math.PI]) {
      const yaw = p.yaw + side;
      const tilt = 0.55;
      const length = 0.4 * s;
      const startY = base + 0.4 * height;
      const mid: [number, number, number] = [
        p.x + (Math.sin(tilt) * Math.sin(yaw) * length) / 2,
        startY + (Math.cos(tilt) * length) / 2,
        p.z + (Math.sin(tilt) * Math.cos(yaw) * length) / 2,
      ];
      stems.set.add(mid, [0.011 * w, length, 0.011 * w], STEM, yaw, -tilt);
    }

    for (let k = 0; k < leafCount; k += 1) {
      const t = 0.35 + (0.65 * k) / (leafCount - 1);
      const yaw = p.yaw + k * 2.4;
      const reach = 0.04 + 0.1 * (0.5 + 0.5 * Math.sin(k * 1.7));
      leaves.set.add(
        [p.x + Math.sin(yaw) * reach, base + height * t, p.z + Math.cos(yaw) * reach],
        0.2 * w,
        pick(LEAF, noise(p.seed * 40, k, 6)),
        yaw,
        0.3 - (1 - t) * 0.5
      );
    }

    for (let j = 0; j < fruitCount; j += 1) {
      const yaw = p.yaw + j * 1.3;
      const reach = 0.09 + 0.05 * noise(p.seed * 40, j, 7);
      const top = base + height * (0.38 + 0.11 * j);
      fruit.set.add(
        [p.x + Math.sin(yaw) * reach, top - 0.1 * w, p.z + Math.cos(yaw) * reach],
        [0.07 * w, 0.1 * w, 0.07 * w],
        pick(PEPPER, noise(p.seed * 40, j, 8)),
        yaw,
        -0.12
      );
    }
  }
  return [stems.part, leaves.part, fruit.part, stakes.part];
};

/** Cucumber: a vine up a string to the high wire, big flat leaves all the way up, and long fruit at the nodes. */
const cucumber: Builder = (layout, quality, make) => {
  const stems = make('stems', geo.cylinder());
  const strings = make('strings', geo.cylinder(), { amp: 0 });
  const leaves = make('leaves', geo.leafRound(), { doubleSide: true, roughness: 0.7 });
  const fruit = make('fruit', geo.cucumber(), { roughness: 0.4 });
  const base = layout.baseY;
  const stringHeight = layout.wireY - base;
  const stringRadius = visibleRadius(0.002, quality);
  const leafCount = quality === 'lite' ? 9 : quality === 'balanced' ? 12 : 15;
  const fruitCount = quality === 'lite' ? 3 : 6;
  const LEAF = ['#3d8a35', '#47993d', '#357d2e'];
  const FRUIT = ['#2f6b2a', '#3b7d30', '#4a8a37'];

  for (const p of layout.plants) {
    const w = p.scale;
    const height = vineHeight(layout, p.scale);
    const stem = visibleRadius(0.009 * w, quality);
    stems.set.add([p.x, base + height / 2, p.z], [stem, height, stem], STEM);
    strings.set.add([p.x + 0.02, base + stringHeight / 2, p.z], [stringRadius, stringHeight, stringRadius], STRING);

    const leafStart = Math.min(0.35, height * 0.15);
    for (let k = 0; k < leafCount; k += 1) {
      const t = k / (leafCount - 1);
      const yaw = p.yaw + k * 2.4;
      leaves.set.add(
        [p.x + Math.sin(yaw) * 0.06, base + leafStart + (height - leafStart) * t, p.z + Math.cos(yaw) * 0.06],
        (0.3 - 0.08 * t) * w,
        pick(LEAF, noise(p.seed * 30, k, 9)),
        yaw,
        0.05 + 0.2 * t
      );
    }

    // Fruit hang from the leaf axils, from 0.5 m up to about two thirds of the vine.
    for (let j = 0; j < fruitCount; j += 1) {
      const yaw = p.yaw + j * 2.1;
      const y = base + 0.5 + Math.max(0, height * 0.65 - 0.5) * (j / Math.max(1, fruitCount - 1));
      fruit.set.add(
        [p.x + Math.sin(yaw) * 0.06, y, p.z + Math.cos(yaw) * 0.06],
        0.26 * w,
        pick(FRUIT, noise(p.seed * 30, j, 10)),
        yaw,
        -0.05
      );
    }
  }
  return [stems.part, strings.part, leaves.part, fruit.part];
};

/** Lettuce: a rosette head built from three rings of ruffled leaves, some heads red. */
const lettuce: Builder = (layout, quality, make) => {
  const leaves = make('leaves', geo.leafRuffled(), { doubleSide: true, roughness: 0.62, amp: 0.1 });
  const base = layout.baseY;
  const whorls = [
    { count: quality === 'lite' ? 5 : 7, pitch: 0.22, length: 0.15, rise: 0.012 },
    { count: quality === 'lite' ? 4 : 6, pitch: 0.65, length: 0.125, rise: 0.025 },
    { count: quality === 'lite' ? 3 : 5, pitch: 1.05, length: 0.095, rise: 0.04 },
  ];
  const GREEN = ['#7ab83a', '#8ccb45', '#6aa530'];
  const RED = ['#8f2f3b', '#a8424a', '#762834'];

  for (const p of layout.plants) {
    const red = p.seed > 0.78;
    whorls.forEach((whorl, wi) => {
      for (let k = 0; k < whorl.count; k += 1) {
        const yaw = p.yaw + (k / whorl.count) * Math.PI * 2 + wi * 0.5;
        const color = wi === 2 ? (red ? '#c25a62' : '#b6dd6a') : pick(red ? RED : GREEN, noise(p.seed * 20, k + wi * 9, 11));
        leaves.set.add([p.x, base + whorl.rise * p.scale, p.z], whorl.length * p.scale, color, yaw, whorl.pitch);
      }
    });
  }
  return [leaves.part];
};

/**
 * Strawberry: a crown of trifoliate leaves on upright stalks (about 25 cm tall and 30 cm across), white
 * flowers, berries among the leaves, and on the outer lines trusses of ripe fruit hanging over the bed
 * edge, clear of the soil, as growers lay them out for picking.
 */
const strawberry: Builder = (layout, quality, make) => {
  const leaves = make('leaves', geo.leafTrifoliate(), { doubleSide: true, roughness: 0.65, amp: 0.1 });
  const fruit = make('fruit', geo.berry(), { roughness: 0.3 });
  const flowers = make('flowers', geo.flowerHead(), { doubleSide: true, roughness: 0.6, amp: 0.1 });
  const trusses = make('trusses', geo.cylinder(), { amp: 0.04 });
  const base = layout.baseY;
  const leafCount = quality === 'lite' ? 6 : 9;
  const berryCount = quality === 'lite' ? 2 : 3;
  const hanging = quality === 'lite' ? 2 : 3;
  const stalk = visibleRadius(0.0025, quality);
  const LEAF = ['#3f7d2c', '#4b8f33', '#36702a', '#467f2f'];
  const RIPE = ['#d2142b', '#e11d48', '#be123c', '#c8102e'];
  const BERRY = [...RIPE, '#f4c6c0', '#a3c25a'];

  for (const p of layout.plants) {
    const w = p.scale;
    for (let k = 0; k < leafCount; k += 1) {
      const yaw = p.yaw + (k / leafCount) * Math.PI * 2 + 0.3 * noise(p.seed * 25, k, 19);
      // Each leaf stands on a stalk leaning out from the crown, with the blade on top tipped outward.
      const inner = k % 3 === 0;
      const lean = inner ? 0.25 : 0.6;
      const length = (inner ? 0.17 : 0.13) * w;
      const tipX = p.x + Math.sin(yaw) * Math.sin(lean) * length;
      const tipY = base + 0.01 + Math.cos(lean) * length;
      const tipZ = p.z + Math.cos(yaw) * Math.sin(lean) * length;
      if (quality !== 'lite') trusses.set.add([(p.x + tipX) / 2, (base + 0.01 + tipY) / 2, (p.z + tipZ) / 2], [stalk, length, stalk], '#5f8a34', yaw, -lean);
      leaves.set.add([tipX, tipY, tipZ], 0.17 * w, pick(LEAF, noise(p.seed * 25, k, 12)), yaw, inner ? 0.2 : -0.15);
    }
    for (let j = 0; j < berryCount; j += 1) {
      const yaw = p.yaw + j * 2.1 + 0.4;
      const reach = 0.09 + 0.04 * (j % 2);
      fruit.set.add(
        [p.x + Math.sin(yaw) * reach, base + 0.02, p.z + Math.cos(yaw) * reach],
        [0.034 * w, 0.045 * w, 0.034 * w],
        pick(BERRY, noise(p.seed * 25, j, 13)),
        yaw,
        -0.9
      );
    }
    // Plants on the outer lines hang a truss of ripe berries over the bed edge.
    if (layout.lineOffsets.length > 1) {
      const side = p.line === 0 ? -1 : p.line === layout.lineOffsets.length - 1 ? 1 : 0;
      if (side !== 0) {
        const edgeX = layout.rowX[p.row] + side * (BED_WIDTH / 2 + 0.02);
        // The truss arches up out of the crown and over the edge, rather than lying flat on the mulch.
        const crown: [number, number, number] = [p.x, base + 0.03, p.z];
        const arc: [number, number, number] = [(p.x + edgeX) / 2, base + 0.08 + 0.02 * p.seed, p.z];
        const lip: [number, number, number] = [edgeX, base + 0.025, p.z];
        addSegment(trusses.set, crown, arc, stalk, '#6b8e3a');
        addSegment(trusses.set, arc, lip, stalk, '#6b8e3a');
        for (let j = 0; j < hanging; j += 1) {
          const z = p.z + (j - (hanging - 1) / 2) * 0.05;
          const drop = 0.05 + 0.04 * j + 0.03 * noise(p.seed * 25, j, 20);
          trusses.set.add([edgeX + side * 0.01, base + 0.02 - drop / 2, z], [stalk, drop, stalk], '#6b8e3a');
          fruit.set.add([edgeX + side * 0.015, base + 0.02 - drop - 0.045 * w, z], [0.036 * w, 0.05 * w, 0.036 * w], pick(RIPE, noise(p.seed * 25, j, 18)));
        }
      }
    }
    if (quality !== 'lite') {
      for (let f = 0; f < 2; f += 1) {
        const yaw = p.yaw + 2 + f * 2.6;
        flowers.set.add([p.x + Math.sin(yaw) * 0.08, base + 0.14, p.z + Math.cos(yaw) * 0.08], 0.022 * w, '#ffffff', yaw, 0);
      }
    }
  }
  return [leaves.part, fruit.part, flowers.part, trusses.part];
};

/** Gerbera: a rosette of long leaves with tall stalks, each topped by a daisy in one of seven colours. */
const gerbera: Builder = (layout, quality, make) => {
  const leaves = make('leaves', geo.leafLong(), { doubleSide: true, roughness: 0.6, amp: 0.06 });
  const stalks = make('stalks', geo.cylinder(), { amp: 0.1 });
  const petals = make('petals', geo.flowerHead(), { doubleSide: true, roughness: 0.5, amp: 0.1 });
  const centres = make('centres', geo.cylinderRound(), { roughness: 0.7, amp: 0.1 });
  const base = layout.baseY;
  const leafCount = quality === 'lite' ? 6 : 9;
  const stalkCount = quality === 'lite' ? 2 : 3;
  const LEAF = ['#2f6d2d', '#3a7c34', '#285f28'];
  const PETAL = ['#ff4d6d', '#ff8fa3', '#ffb703', '#fb5607', '#ffd166', '#f72585', '#ffffff'];

  for (const p of layout.plants) {
    const s = p.scale * (0.55 + 0.45 * layout.heightScale);
    for (let k = 0; k < leafCount; k += 1) {
      const yaw = p.yaw + (k / leafCount) * Math.PI * 2;
      leaves.set.add([p.x, base + 0.02, p.z], 0.26 * s, pick(LEAF, noise(p.seed * 35, k, 14)), yaw, 0.6);
    }
    for (let j = 0; j < stalkCount; j += 1) {
      const yaw = p.yaw + j * 2.1 + 0.7;
      const lean = 0.1 + 0.1 * noise(p.seed * 35, j, 15);
      const length = (0.38 + 0.2 * noise(p.seed * 35, j, 16)) * s;
      const topX = p.x + Math.sin(lean) * Math.sin(yaw) * length;
      const topY = base + 0.04 + Math.cos(lean) * length;
      const topZ = p.z + Math.sin(lean) * Math.cos(yaw) * length;
      stalks.set.add([(p.x + topX) / 2, (base + 0.04 + topY) / 2, (p.z + topZ) / 2], [visibleRadius(0.006, quality), length, visibleRadius(0.006, quality)], '#6b8e3a', yaw, -lean);
      const color = pick(PETAL, noise(p.seed * 35, j, 17));
      petals.set.add([topX, topY, topZ], 0.075 * s, color, yaw, 0);
      centres.set.add([topX, topY + 0.006, topZ], [0.018 * s, 0.012, 0.018 * s], '#5a3a14', yaw, 0);
    }
  }
  return [leaves.part, stalks.part, petals.part, centres.part];
};

const BUILDERS: Record<CropType, Builder> = { tomato, capsicum, cucumber, lettuce, strawberry, gerbera };

/** Overhead wire and posts for crops trained up strings. Wire hangs at layout.wireY along every row. */
function trellis(layout: CropLayout, quality: RenderQuality, make: PartFactory): CropPart[] {
  const wire = visibleRadius(0.004, quality);
  const wires = make('wires', geo.cylinder(), { amp: 0, metalness: 0.6 });
  const posts = make('posts', geo.cylinder(), { amp: 0, metalness: 0.5 });
  const hooks = make('hooks', geo.box(), { amp: 0, roughness: 0.5 });
  // A high-wire hook on the wire above every plant holds the spare twine.
  for (const p of layout.plants) hooks.set.add([p.x + 0.025, layout.wireY - 0.04, p.z], [0.018, 0.08, 0.012], '#2f6b3a');
  const postCount = Math.max(2, Math.floor(layout.rowLength / 5) + 1);
  for (const x of layout.rowX) {
    wires.set.add([x, layout.wireY, 0], [wire, layout.rowLength + 0.4, wire], '#9ca3af', 0, Math.PI / 2);
    for (let i = 0; i < postCount; i += 1) {
      const z = layout.zMin + (i * layout.rowLength) / (postCount - 1);
      posts.set.add([x, layout.wireY / 2, z], [0.025, layout.wireY, 0.025], '#6b7280');
    }
  }
  return [wires.part, posts.part, hooks.part];
}

export function buildCropParts(layout: CropLayout, quality: RenderQuality): CropParts {
  const materials: THREE.Material[] = [];
  const make: PartFactory = (name, geometry, options = {}) => {
    const material = createMotionMaterial(
      'sway',
      {
        color: '#ffffff',
        roughness: options.roughness ?? 0.8,
        metalness: options.metalness ?? 0,
        side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      },
      { amp: options.amp ?? 0.03, base: layout.baseY }
    );
    materials.push(material);
    const set = new InstanceSet();
    return { part: { name: `${layout.spec.id}-${name}`, geometry, material, set }, set };
  };

  const crop = layout.spec.id;
  const parts = BUILDERS[crop](layout, quality, make);
  if (layout.spec.trellis) parts.push(...trellis(layout, quality, make));
  return { crop, parts, dispose: () => materials.forEach((material) => material.dispose()) };
}

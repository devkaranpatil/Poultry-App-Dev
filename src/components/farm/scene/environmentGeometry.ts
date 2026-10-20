import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RenderQuality } from './shedLayout';
import { groundHeight, type FarKind, type LandscapeLook, type TreeKind } from './environmentLooks';

/**
 * Low-poly shapes for the landscape round the house. Every shape is unit sized (a tree is 1 tall, a
 * hill has base radius 1 and height 1) and coloured per vertex, so one InstancedMesh draws all the
 * trees or hills of a kind and the instance colour tints them. The caller owns and disposes them.
 */

/** Deterministic -1..1 wobble for a point, so shared seam vertices move together. */
function wobble(x: number, y: number, z: number) {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/** Non-indexed, no UVs, one colour (or a colour per vertex from a function): ready to merge. */
function paint(geometry: THREE.BufferGeometry, color: string | ((x: number, y: number, z: number, ny: number) => THREE.Color)) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  if (!flat.getAttribute('normal')) flat.computeVertexNormals();
  const position = flat.getAttribute('position');
  const normal = flat.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const fixed = typeof color === 'string' ? new THREE.Color(color) : null;
  for (let i = 0; i < position.count; i += 1) {
    const c = fixed ?? (color as (x: number, y: number, z: number, ny: number) => THREE.Color)(position.getX(i), position.getY(i), position.getZ(i), normal.getY(i));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  return merged;
}

/** Moves each vertex out from the Y axis by a wobble, except the ones on the axis (apex, centre). */
function roughen(geometry: THREE.BufferGeometry, amount: number) {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue;
    const k = 1 + wobble(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000) * amount;
    position.setXYZ(i, x * k, y * (1 + (k - 1) * 0.6), z * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const WHITE = '#ffffff';

function blob(radius: number, x: number, y: number, z: number, squash = 0.8, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.scale(1, squash, 1);
  geometry.translate(x, y, z);
  return paint(geometry, WHITE);
}

function trunk(bottom: number, top: number, height: number, color: string, lean = 0) {
  const geometry = new THREE.CylinderGeometry(top, bottom, height, 5, 1);
  geometry.translate(0, height / 2, 0);
  if (lean) geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(lean));
  return paint(geometry, color);
}

/** A drooping palm frond: a tapering strip arching out and down, along +X from the crown. */
function frond(length: number, width: number, yaw: number, lift: number) {
  const steps = 5;
  const positions: number[] = [];
  const point = (t: number, side: number) => {
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * side;
    return [t * length, lift * t - 1.4 * length * t * t * 0.45, w];
  };
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const a = point(t0, -1);
    const b = point(t0, 1);
    const c = point(t1, -1);
    const d = point(t1, 1);
    // Fold the blade up a little along the rib.
    a[1] -= width * 0.3;
    b[1] -= width * 0.3;
    c[1] -= width * 0.3;
    d[1] -= width * 0.3;
    const mid0 = point(t0, 0);
    const mid1 = point(t1, 0);
    positions.push(...a, ...mid0, ...c, ...mid0, ...mid1, ...c, ...mid0, ...b, ...mid1, ...b, ...d, ...mid1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.rotateY(yaw);
  geometry.computeVertexNormals();
  return geometry;
}

export interface TreeShapes {
  /** Trunk and branches, coloured by the geometry (null: a bush, all leaves). */
  wood: THREE.BufferGeometry | null;
  /** Foliage in white, tinted per instance. */
  leaves: THREE.BufferGeometry;
}

/** A tree of the kind, 1 tall. */
export function treeShapes(kind: TreeKind): TreeShapes {
  switch (kind) {
    case 'broadleaf':
      // Neem or mango: a short trunk under a broad, lumpy round crown.
      return {
        wood: trunk(0.05, 0.035, 0.45, '#5e4634'),
        leaves: merge([blob(0.3, 0, 0.62, 0, 0.78), blob(0.22, 0.17, 0.52, 0.06, 0.8), blob(0.21, -0.15, 0.55, -0.1, 0.8), blob(0.18, 0.02, 0.8, -0.04, 0.8)]),
      };
    case 'palm': {
      // Coconut: a slender, curving grey trunk and a crown of drooping fronds.
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.35, 0), new THREE.Vector3(0.14, 0.7, 0), new THREE.Vector3(0.24, 0.96, 0)]);
      const wood = paint(new THREE.TubeGeometry(curve, 8, 0.018, 5, false), '#8a7b66');
      const crown = new THREE.Vector3(0.24, 0.96, 0);
      const fronds: THREE.BufferGeometry[] = [];
      const count = 11;
      for (let i = 0; i < count; i += 1) {
        const f = frond(0.34 + (i % 3) * 0.03, 0.055, (i / count) * Math.PI * 2 + (i % 2) * 0.2, i % 2 ? 0.22 : 0.12);
        f.translate(crown.x, crown.y, crown.z);
        fronds.push(paint(f, WHITE));
      }
      // A few nuts under the crown.
      fronds.push(paint(new THREE.IcosahedronGeometry(0.035, 0).translate(crown.x, crown.y - 0.03, crown.z), '#7a6a3a'));
      return { wood, leaves: merge(fronds) };
    }
    case 'conifer': {
      // Deodar or pine: tiers of cones narrowing to a spire.
      const tiers = [
        [0.24, 0.42, 0.16],
        [0.19, 0.36, 0.38],
        [0.14, 0.3, 0.58],
        [0.08, 0.24, 0.76],
      ].map(([r, h, y]) => paint(new THREE.ConeGeometry(r, h, 7, 1).translate(0, y + h / 2, 0), WHITE));
      return { wood: trunk(0.035, 0.025, 0.3, '#5a4231'), leaves: merge(tiers) };
    }
    case 'khejri':
      // Khejri or babul: a leaning trunk under a thin, flat, open umbrella of a crown.
      return {
        wood: trunk(0.05, 0.03, 0.62, '#6e5a46', 0.08),
        leaves: merge([blob(0.26, -0.05, 0.72, 0, 0.38, 0), blob(0.22, 0.16, 0.66, 0.1, 0.4, 0), blob(0.2, -0.2, 0.64, -0.12, 0.4, 0)]),
      };
    case 'scrub':
      // A thorny bush, about as wide as it is tall.
      return {
        wood: null,
        leaves: merge([blob(0.36, 0, 0.42, 0, 0.9, 0), blob(0.3, 0.28, 0.3, 0.1, 0.85, 0), blob(0.28, -0.26, 0.28, -0.08, 0.85, 0), blob(0.22, 0.05, 0.7, 0.05, 1, 0)]),
      };
  }
}

const c = (hex: string) => new THREE.Color(hex);

/** A far landform of the kind: base radius 1 (before stretching along the horizon), height 1. */
export function farShape(kind: FarKind): THREE.BufferGeometry {
  switch (kind) {
    case 'treeline': {
      // A belt of trees on the horizon (a village grove, a canal bank): a row of lumpy crowns.
      const crowns: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 7; i += 1) {
        const x = -0.85 + (i / 6) * 1.7;
        const r = 0.28 + ((i * 37) % 5) * 0.03;
        const crown = new THREE.IcosahedronGeometry(r, 0);
        crown.scale(1, (0.5 / r) * (0.8 + ((i * 53) % 4) * 0.08), 0.9);
        crown.translate(x, 0.45, ((i * 29) % 3) * 0.1 - 0.1);
        crowns.push(paint(crown, (_x, y) => c('#ffffff').multiplyScalar(0.75 + 0.25 * y)));
      }
      return merge(crowns);
    }
    case 'hill':
    case 'ridge': {
      const dome = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      roughen(dome, kind === 'ridge' ? 0.12 : 0.06);
      // Lighter crests, darker folds at the foot.
      return paint(dome, (_x, y) => c('#ffffff').multiplyScalar(0.78 + 0.22 * y));
    }
    case 'mesa': {
      // A Deccan trap hill: steep banded basalt sides and a flat, grassy top.
      // Two steps, as the lava flows weathered: a wide talus foot and a steep upper scarp.
      const foot = new THREE.CylinderGeometry(0.82, 1, 0.5, 11, 2);
      foot.translate(0, 0.25, 0);
      const scarp = new THREE.CylinderGeometry(0.62, 0.7, 0.5, 11, 2);
      scarp.translate(0, 0.75, 0);
      const bands = [c('#7c5a44'), c('#8e6c50'), c('#6c4c3a'), c('#93735a')];
      const color = (_x: number, y: number, _z: number, ny: number) => (ny > 0.8 ? c('#a99e60') : bands[Math.min(3, Math.floor(y * 4))].clone());
      return merge([paint(roughen(foot, 0.06), color), paint(roughen(scarp, 0.05), color)]);
    }
    case 'dune': {
      // A crescent of sand: a long gentle back and a steeper slip face.
      const dune = new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const position = dune.getAttribute('position');
      for (let i = 0; i < position.count; i += 1) position.setX(i, position.getX(i) + position.getY(i) * 0.12);
      dune.computeVertexNormals();
      return paint(dune, WHITE);
    }
    case 'peak': {
      // A Himalayan peak: forest at the foot, bare rock, then snow from about half way up.
      const peak = new THREE.ConeGeometry(1, 1, 9, 6);
      peak.translate(0, 0.5, 0);
      roughen(peak, 0.22);
      return paint(peak, (x, y, z) => {
        const line = 0.5 + wobble(x, 0, z) * 0.08;
        if (y > line) return c('#f4f7fb');
        if (y > 0.22) return c('#79818c');
        return c('#3f573f');
      });
    }
  }
}

/** A flat field plot, 1 x 1, lying on the ground. */
export function fieldShape() {
  return paint(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), WHITE);
}

/** A clipped tea hedge, 1 x 1 x 1 along Z, rounded on top. */
export function teaRowShape() {
  const hedge = new THREE.CylinderGeometry(0.5, 0.5, 1, 7, 1, false, 0, Math.PI);
  hedge.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 2, 1);
  return paint(hedge, WHITE);
}

/** One terrace step: a cylinder slice with earth sides and a crop-green top. */
export function terraceShape() {
  const step = new THREE.CylinderGeometry(1, 1.04, 1, 18, 1);
  step.translate(0, 0.5, 0);
  roughen(step, 0.05);
  return paint(step, (_x, _y, _z, ny) => (ny > 0.5 ? c('#8fb25a') : c('#8a7656')));
}

const GROUND_DETAIL: Record<RenderQuality, [number, number]> = { high: [44, 80], balanced: [32, 64], lite: [20, 44] };

/**
 * The ground: a disc of rings, closer together near the house, coloured in soft patches (laterite,
 * sand, fallow) and lifted into rolling hills away from the house where the landscape has relief.
 */
export function groundShape(look: LandscapeLook, flat: number, radius: number, quality: RenderQuality) {
  const [rings, segments] = GROUND_DETAIL[quality];
  const base = c(look.ground);
  const alt = c(look.groundAlt);
  const patch = c(look.groundPatch);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new THREE.Color();
  const push = (x: number, z: number) => {
    positions.push(x, groundHeight(look, x, z, flat), z);
    const drift = 0.5 + 0.5 * Math.sin(x * 0.021 + 1.7) * Math.cos(z * 0.017 - 0.4);
    const blot = 0.5 + 0.3 * Math.sin(x * 0.047 + z * 0.031 + 0.9) + 0.2 * Math.cos(x * 0.083 - z * 0.061);
    color.copy(base).lerp(alt, drift);
    if (blot > 1 - look.patchShare) color.lerp(patch, Math.min(0.7, (blot - (1 - look.patchShare)) * 5));
    colors.push(color.r, color.g, color.b);
  };
  push(0, 0);
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = radius * Math.pow(ring / rings, 1.7);
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      push(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  for (let s = 0; s < segments; s += 1) indices.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let ring = 1; ring < rings; ring += 1) {
    const inner = 1 + (ring - 1) * segments;
    const outer = inner + segments;
    for (let s = 0; s < segments; s += 1) {
      const n = (s + 1) % segments;
      indices.push(inner + s, inner + n, outer + s, inner + n, outer + n, outer + s);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Shared geometry for the crop and irrigation models. Each shape is built once and reused by every
 * instance, so a field of hundreds of plants costs a handful of geometries.
 *
 * Conventions: leaves lie flat in the XZ plane with the tip along +Z and the stalk end at the
 * origin. Unit shapes (cylinder, sphere) have radius/length 1 and are sized by instance scale.
 */

const cache = new Map<string, THREE.BufferGeometry>();

function memo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = make();
    cache.set(key, geometry);
  }
  return geometry;
}

interface LeafOptions {
  /** Width as a fraction of the (unit) length. */
  width: number;
  /** 'lens' is pointed at both ends, 'round' is broad near the stalk. */
  profile: 'lens' | 'round';
  /** How far the tip bends down, as a fraction of length. */
  droop?: number;
  /** How far the blade folds up along the midrib. */
  fold?: number;
  /** Wavy edge amount (lettuce). */
  ruffle?: number;
  lengthSegments?: number;
  widthSegments?: number;
}

/** A curved leaf blade of length 1 pointing along +Z. */
export function makeLeaf({ width, profile, droop = 0.25, fold = 0.3, ruffle = 0, lengthSegments = 5, widthSegments = 2 }: LeafOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const columns = widthSegments * 2 + 1;

  for (let i = 0; i <= lengthSegments; i += 1) {
    const t = i / lengthSegments;
    const outline = profile === 'lens' ? Math.pow(Math.sin(Math.PI * t), 0.85) : Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.7);
    const halfWidth = (width / 2) * outline;
    for (let j = -widthSegments; j <= widthSegments; j += 1) {
      const u = j / widthSegments;
      const x = u * halfWidth;
      const y = fold * Math.abs(x) - droop * t * t + ruffle * Math.sin(t * 9 + u * 5) * Math.abs(u) * halfWidth;
      positions.push(x, y, t);
    }
  }
  for (let i = 0; i < lengthSegments; i += 1) {
    for (let j = 0; j < columns - 1; j += 1) {
      const a = i * columns + j;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Applies a rotation and offset to a copy of a geometry. */
function placed(source: THREE.BufferGeometry, yaw: number, pitch: number, offsetZ = 0, scale = 1): THREE.BufferGeometry {
  const geometry = source.clone();
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')),
    new THREE.Vector3(scale, scale, scale)
  );
  geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, offsetZ).premultiply(matrix));
  return geometry;
}

export const geo = {
  cylinder: () => memo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, false)),
  cylinderRound: () => memo('cylinderRound', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1, false)),
  box: () => memo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** Square tube with the same convention as the unit cylinders: half-width 1, height 1. */
  square: () => memo('square', () => new THREE.BoxGeometry(2, 1, 2)),
  sphere: () => memo('sphere', () => new THREE.SphereGeometry(1, 8, 6)),
  sphereFine: () => memo('sphereFine', () => new THREE.SphereGeometry(1, 12, 8)),
  cone: () => memo('cone', () => new THREE.ConeGeometry(1, 1, 10, 1, true)),

  /** Tomato, capsicum and gerbera leaf: pointed, gently drooping. */
  leafLens: () => memo('leafLens', () => makeLeaf({ width: 0.5, profile: 'lens', droop: 0.28, fold: 0.35 })),
  /** Cucumber leaf: broad and almost flat. */
  leafRound: () => memo('leafRound', () => makeLeaf({ width: 1.0, profile: 'round', droop: 0.12, fold: 0.12, widthSegments: 3 })),
  /** Lettuce leaf: wide with a wavy edge. */
  leafRuffled: () => memo('leafRuffled', () => makeLeaf({ width: 0.95, profile: 'round', droop: 0.18, fold: 0.2, ruffle: 0.09, lengthSegments: 6, widthSegments: 3 })),
  /** Gerbera leaf: long and narrow. */
  leafLong: () => memo('leafLong', () => makeLeaf({ width: 0.34, profile: 'lens', droop: 0.2, fold: 0.5, lengthSegments: 6 })),
  /** Strawberry leaf: three leaflets joined at the base. */
  leafTrifoliate: () =>
    memo('leafTrifoliate', () => {
      const leaflet = makeLeaf({ width: 0.62, profile: 'lens', droop: 0.15, fold: 0.3, widthSegments: 2 });
      return mergeGeometries([placed(leaflet, 0, 0, 0.05, 0.62), placed(leaflet, 0.85, 0, 0.05, 0.5), placed(leaflet, -0.85, 0, 0.05, 0.5)], false)!;
    }),

  /** Daisy flower head of radius ~1: a ring of petals around an empty centre. */
  flowerHead: () =>
    memo('flowerHead', () => {
      const petal = makeLeaf({ width: 0.2, profile: 'lens', droop: -0.12, fold: 0.1, lengthSegments: 3, widthSegments: 1 });
      const petals = Array.from({ length: 16 }, (_, k) => placed(petal, (k / 16) * Math.PI * 2, 0.18, 0.1, 0.9));
      return mergeGeometries(petals, false)!;
    }),

  /** Bell pepper, hanging: stalk end at y=1, blunt tip at y=0. Radius ~0.5. */
  pepper: () =>
    memo('pepper', () =>
      new THREE.LatheGeometry(
        [[0, 0], [0.26, 0.03], [0.44, 0.18], [0.5, 0.5], [0.46, 0.78], [0.3, 0.94], [0.12, 1], [0, 0.97]].map(([x, y]) => new THREE.Vector2(x, y)),
        10
      )
    ),
  /** Strawberry: wide shoulders at y=1, point at y=0. Radius ~0.5. */
  berry: () =>
    memo('berry', () =>
      new THREE.LatheGeometry(
        [[0, 0], [0.14, 0.1], [0.32, 0.32], [0.46, 0.62], [0.5, 0.86], [0.36, 1], [0, 1.02]].map(([x, y]) => new THREE.Vector2(x, y)),
        9
      )
    ),
  /** Cucumber: a capsule of length 1 radius 0.12 along Y. */
  cucumber: () => memo('cucumber', () => new THREE.CapsuleGeometry(0.125, 0.75, 3, 8)),
  droplet: () => memo('droplet', () => new THREE.SphereGeometry(1, 6, 5)),
};

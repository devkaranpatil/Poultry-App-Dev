import * as THREE from 'three';

/**
 * Shared unit geometry for the instanced parts of the shed. Each shape is built once and reused by every
 * instance, so hundreds of posts, pans or cages cost a handful of geometries.
 *
 * Unit shapes (cylinder, sphere) have radius and length 1 and are sized by instance scale.
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

export const geo = {
  cylinder: () => memo('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, false)),
  cylinderRound: () => memo('cylinderRound', () => new THREE.CylinderGeometry(1, 1, 1, 12, 1, false)),
  box: () => memo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** Square tube with the same convention as the unit cylinders: half-width 1, height 1. */
  square: () => memo('square', () => new THREE.BoxGeometry(2, 1, 2)),
  sphere: () => memo('sphere', () => new THREE.SphereGeometry(1, 8, 6)),
  sphereFine: () => memo('sphereFine', () => new THREE.SphereGeometry(1, 12, 8)),
  cone: () => memo('cone', () => new THREE.ConeGeometry(1, 1, 10, 1, true)),
};

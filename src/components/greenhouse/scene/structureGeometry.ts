import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Point2 } from './structureLayout';

/**
 * Geometry for the building: pipes bent along a polyline (arches, trusses), sheets swept along the
 * length (roof film, side walls, vent nets), end-wall outlines with door and pad openings, and a few
 * fittings. Everything is built in metres from the structure layout; callers own and dispose it.
 */

export type Point3 = readonly [number, number, number];
export type PipeProfile = 'round' | 'box';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * One pipe per segment of every polyline, merged into one geometry. A box profile (aluminium) has four
 * flat faces. Short overlaps at the joints hide the gaps a bend would leave.
 */
export function pipeGeometry(lines: readonly (readonly Point3[])[], radius: number, profile: PipeProfile = 'round', radialSegments = 8): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const sides = profile === 'box' ? 4 : radialSegments;
  const thetaStart = profile === 'box' ? Math.PI / 4 : 0;
  const r = profile === 'box' ? radius * Math.SQRT2 : radius;

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i += 1) {
      a.set(...line[i]);
      b.set(...line[i + 1]);
      dir.subVectors(b, a);
      const length = dir.length();
      if (length < 1e-4) continue;
      dir.divideScalar(length);
      const piece = new THREE.CylinderGeometry(r, r, length + radius * 0.6, sides, 1, true, thetaStart);
      quaternion.setFromUnitVectors(UP, dir);
      matrix.compose(a.clone().add(b).multiplyScalar(0.5), quaternion, new THREE.Vector3(1, 1, 1));
      piece.applyMatrix4(matrix);
      pieces.push(piece);
    }
  }
  if (pieces.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(pieces, false) ?? new THREE.BufferGeometry();
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

/** A 2D polyline in the XY plane lifted to 3D (z = 0), shifted by (dx, dy). */
export function lift(points: readonly Point2[], dx = 0, dy = 0): Point3[] {
  return points.map(([x, y]) => [x + dx, y + dy, 0] as const);
}

/**
 * Every polyline (profile in XY) copied to every x offset and swept along z from z0 to z1: roof film
 * over each span, side wall sheets, vent nets. UVs are in metres (u along the profile, v along z), so
 * a repeating net texture keeps the same mesh size on every surface.
 */
export function sweptSheet(lines: readonly (readonly Point2[])[], offsets: readonly number[], y0: number, z0: number, z1: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const dx of offsets) {
    for (const line of lines) {
      let u = 0;
      for (let i = 0; i < line.length - 1; i += 1) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        const step = Math.hypot(bx - ax, by - ay);
        const base = positions.length / 3;
        positions.push(ax + dx, ay + y0, z0, bx + dx, by + y0, z0, ax + dx, ay + y0, z1, bx + dx, by + y0, z1);
        uvs.push(u, z0, u + step, z0, u, z1, u + step, z1);
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        u += step;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The end wall outline across the whole width: up each outer column, over every span's arch, down
 * the other side. Openings (door, cooling pad) are cut as holes. UVs are the shape's metres.
 */
export function endWallGeometry(spanCentres: readonly number[], arch: readonly Point2[], halfWidth: number, gutterHeight: number, holes: readonly Rect[] = []): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(-halfWidth, gutterHeight);
  spanCentres.forEach((cx) => {
    arch.forEach(([x, y], i) => {
      if (i === 0) return; // shared with the previous span's last point
      shape.lineTo(cx + x, gutterHeight + y);
    });
  });
  shape.lineTo(halfWidth, 0);
  shape.closePath();
  for (const rect of holes) {
    const hole = new THREE.Path();
    hole.moveTo(rect.x0, rect.y0);
    hole.lineTo(rect.x0, rect.y1);
    hole.lineTo(rect.x1, rect.y1);
    hole.lineTo(rect.x1, rect.y0);
    hole.closePath();
    shape.holes.push(hole);
  }
  return new THREE.ShapeGeometry(shape);
}

/** A sheet-metal gutter one metre long along z: a flat bottom and two lips. Scale z to the length. */
export function gutterChannel(width: number, depth: number): THREE.BufferGeometry {
  const t = 0.012;
  const bottom = new THREE.BoxGeometry(width, t, 1).translate(0, -depth, 0);
  const left = new THREE.BoxGeometry(t, depth, 1).translate(-width / 2, -depth / 2, 0);
  const right = new THREE.BoxGeometry(t, depth, 1).translate(width / 2, -depth / 2, 0);
  const merged = mergeGeometries([bottom, left, right], false)!;
  [bottom, left, right].forEach((g) => g.dispose());
  return merged;
}

/** Fan rotor of radius 1 facing +z: a hub and `blades` pitched blades. */
export function fanRotor(blades: number): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12).rotateX(Math.PI / 2)];
  for (let k = 0; k < blades; k += 1) {
    const blade = new THREE.BoxGeometry(0.34, 0.86, 0.02).translate(0, 0.52, 0).rotateY(0.35);
    blade.rotateZ((k / blades) * Math.PI * 2);
    pieces.push(blade);
  }
  const nonIndexed = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(nonIndexed, false)!;
  pieces.forEach((g) => g.dispose());
  nonIndexed.forEach((g) => g.dispose());
  return merged;
}

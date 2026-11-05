import * as THREE from 'three';

/** A list of instances (position, rotation, scale, colour) that becomes one InstancedMesh. */
export class InstanceSet {
  readonly matrices: number[] = [];
  readonly colors: number[] = [];
  count = 0;

  private readonly object = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor() {
    this.object.rotation.order = 'YXZ';
  }

  /** Rotation is yaw (about Y), pitch (tip up, about X) and roll (about Z), in radians. */
  add(
    position: [number, number, number],
    scale: [number, number, number] | number,
    color: string | number = '#ffffff',
    yaw = 0,
    pitch = 0,
    roll = 0
  ): this {
    const o = this.object;
    o.position.set(position[0], position[1], position[2]);
    o.rotation.set(-pitch, yaw, roll);
    if (typeof scale === 'number') o.scale.set(scale, scale, scale);
    else o.scale.set(scale[0], scale[1], scale[2]);
    o.updateMatrix();
    for (let i = 0; i < 16; i += 1) this.matrices.push(o.matrix.elements[i]);
    this.color.set(color);
    this.colors.push(this.color.r, this.color.g, this.color.b);
    this.count += 1;
    return this;
  }
}

/**
 * Adds a unit cylinder (or box) stretched from a to b with the given radius: a pipe, cable or brace
 * at any angle. Local +Y is turned to point along the segment.
 */
export function addSegment(
  set: InstanceSet,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  radius: number,
  color: string | number = '#ffffff'
): InstanceSet {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-5) return set;
  const horizontal = Math.hypot(dx, dz);
  const yaw = horizontal > 1e-6 ? Math.atan2(-dx, -dz) : 0;
  const pitch = Math.atan2(horizontal, dy);
  return set.add([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [radius, length, radius], color, yaw, pitch);
}

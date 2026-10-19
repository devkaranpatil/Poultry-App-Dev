import * as THREE from 'three';
import type { GreenhouseConfig } from '@/types/greenhouse';
import { MODEL_ROOT_NAME, objectBelongsToPart, type EditablePart } from '@/lib/sceneEdit';

type Dimensions = Pick<GreenhouseConfig, 'length' | 'width' | 'gutterHeight' | 'ridgeHeight'>;

/** The box the house itself fills, from the config (the model may still be animating towards it). */
export function houseBox(config: Dimensions, target = new THREE.Box3()): THREE.Box3 {
  const halfWidth = Math.max(config.width, 1) / 2;
  const halfLength = Math.max(config.length, 1) / 2;
  return target.set(
    new THREE.Vector3(-halfWidth, 0, -halfLength),
    new THREE.Vector3(halfWidth, Math.max(config.ridgeHeight, config.gutterHeight, 1), halfLength)
  );
}

/** The named groups inside the model that make up a part (outermost matches only). */
export function partObjects(scene: THREE.Object3D, part: EditablePart): THREE.Object3D[] {
  const root = scene.getObjectByName(MODEL_ROOT_NAME);
  if (!root || part === 'size') return [];
  const found: THREE.Object3D[] = [];
  const visit = (object: THREE.Object3D) => {
    for (const child of object.children) {
      if (objectBelongsToPart(child.name, part)) found.push(child);
      else visit(child);
    }
  };
  visit(root);
  return found;
}

const scratch = new THREE.Box3();

/**
 * The world-space box around a part, for its selection outline and for framing it. The house, and
 * parts the model has not built yet, fall back to the box the config describes.
 */
export function partBounds(scene: THREE.Object3D, part: EditablePart, config: Dimensions, target = new THREE.Box3()): THREE.Box3 {
  target.makeEmpty();
  if (part !== 'size') {
    for (const object of partObjects(scene, part)) {
      object.updateWorldMatrix(true, true);
      scratch.setFromObject(object);
      if (!scratch.isEmpty()) target.union(scratch);
    }
  }
  if (target.isEmpty() || !Number.isFinite(target.min.x) || !Number.isFinite(target.max.x)) {
    houseBox(config, target);
    if (part === 'roof' && config.ridgeHeight > config.gutterHeight) target.min.y = config.gutterHeight;
  }
  return target;
}

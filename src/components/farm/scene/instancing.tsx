import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { InstanceSet } from './instanceSet';

interface InstancedPartProps {
  /** Shown in the scene tree, so tests and tools can find a part by name. */
  name: string;
  set: InstanceSet;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  receiveShadow?: boolean;
  castShadow?: boolean;
  renderOrder?: number;
}

/** Renders an InstanceSet. The mesh is rebuilt when the number of instances changes (WebGL buffers cannot resize). */
export function InstancedPart({ name, set, geometry, material, receiveShadow = false, castShadow = false, renderOrder }: InstancedPartProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh || set.count === 0) return;
    (mesh.instanceMatrix.array as Float32Array).set(set.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (!mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(set.count * 3), 3);
    (mesh.instanceColor.array as Float32Array).set(set.colors);
    mesh.instanceColor.needsUpdate = true;
    mesh.userData.instanceCount = set.count;
  }, [set]);

  if (set.count === 0) return null;
  return (
    <instancedMesh
      key={set.count}
      ref={ref}
      name={name}
      args={[geometry, material, set.count]}
      frustumCulled={false}
      receiveShadow={receiveShadow}
      castShadow={castShadow}
      renderOrder={renderOrder}
    />
  );
}

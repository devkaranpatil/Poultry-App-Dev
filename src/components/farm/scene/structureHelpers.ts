import { useEffect } from 'react';
import * as THREE from 'three';
import type { ShedLayout } from './shedLayout';
import { disposeMaterial } from './shedMaterials';

type Disposable = { dispose: () => void };

/** Disposes what a part built for itself when it is rebuilt or unmounts. */
export function useDisposal(items: ReadonlyArray<Disposable | THREE.Material>) {
  useEffect(
    () => () => {
      for (const item of items) {
        if (item instanceof THREE.Material) disposeMaterial(item);
        else item.dispose();
      }
    },
    [items]
  );
}

/** A plane `width` by `height` metres whose UVs are metres, so tiled textures keep their real size. */
export function metrePlane(width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(Math.max(width, 0.01), Math.max(height, 0.01));
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * height);
  return geometry;
}

/** The 50-inch box fans of a tunnel shed: as many as fit across the back end wall. */
export function tunnelFans(layout: Pick<ShedLayout, 'halfWidth' | 'eavesHeight'>): { size: number; y: number; xs: number[] } {
  const size = Math.min(1.38, layout.eavesHeight - 0.35);
  const width = layout.halfWidth * 2;
  const count = Math.max(1, Math.floor((width - 0.4) / (size + 0.2)));
  const pitch = width / count;
  return { size, y: 0.25 + size / 2, xs: Array.from({ length: count }, (_, i) => -layout.halfWidth + pitch * (i + 0.5)) };
}

import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { RenderQuality } from '@/components/greenhouse/scene/cropLayout';
import { createCoverMaterial, createInsectNetMaterial } from '@/components/greenhouse/scene/structureMaterials';

const QUALITIES: RenderQuality[] = ['high', 'balanced', 'lite'];

describe('cover materials', () => {
  // jsdom has no 2D canvas; the net weave texture is then skipped, as it is on lite.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('keeps glass, insect net and UV film apart at every quality', () => {
    for (const quality of QUALITIES) {
      const glass = createCoverMaterial('glass', quality) as THREE.MeshPhysicalMaterial;
      const film = createCoverMaterial('uv-polyfilm', quality) as THREE.MeshPhysicalMaterial;
      const net = createInsectNetMaterial(quality);
      // Glass is the clearest and glossiest, film the most milky, the net a matte haze in between.
      expect(glass.opacity, quality).toBeLessThan(0.2);
      expect(film.opacity, quality).toBeGreaterThan(0.5);
      expect(glass.roughness).toBeLessThan(film.roughness);
      expect(net.roughness).toBe(1);
      // Film has a green cast; the net is a neutral white-grey.
      expect(film.color.g).toBeGreaterThan(film.color.r);
      expect(Math.abs(net.color.r - net.color.g)).toBeLessThan(0.03);
      [glass, film, net].forEach((material) => material.dispose());
    }
  });

  it('only lets glass refract on high', () => {
    for (const quality of QUALITIES) {
      const glass = createCoverMaterial('glass', quality) as THREE.MeshPhysicalMaterial;
      const film = createCoverMaterial('uv-polyfilm', quality) as THREE.MeshPhysicalMaterial;
      expect(glass.transmission > 0).toBe(quality === 'high');
      expect(film.transmission).toBe(0);
      glass.dispose();
      film.dispose();
    }
  });
});

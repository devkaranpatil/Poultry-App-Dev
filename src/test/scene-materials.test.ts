import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderQuality } from '@/components/farm/scene/shedLayout';
import { ROOF_SHEET_OPTIONS } from '@/types/farm';
import { SHEET_LOOK, createMeshMaterial, createSheetMaterial } from '@/components/farm/scene/shedMaterials';

const QUALITIES: RenderQuality[] = ['high', 'balanced', 'lite'];

describe('shed materials', () => {
  // jsdom has no 2D canvas; the textures are then skipped, as they are on lite.
  beforeAll(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('gives every roof sheet its own look', () => {
    const colours = new Set(ROOF_SHEET_OPTIONS.map((option) => SHEET_LOOK[option.value].color));
    expect(colours.size).toBe(ROOF_SHEET_OPTIONS.length);
    // Metal sheets shine, fibre cement and thatch do not; PUF panels and thatch are thick.
    expect(SHEET_LOOK['gi-sheet'].metalness).toBeGreaterThan(SHEET_LOOK['fibre-cement'].metalness);
    expect(SHEET_LOOK.thatch.roughness).toBe(1);
    expect(SHEET_LOOK['puf-panel'].thickness).toBeGreaterThan(SHEET_LOOK['gi-sheet'].thickness * 3);
    for (const quality of QUALITIES) {
      const sheet = createSheetMaterial('gi-sheet', quality, 20, 4);
      expect(sheet.transparent).toBe(false);
      sheet.dispose();
    }
  });

  it('draws the wire mesh as a see-through haze at every quality', () => {
    for (const quality of QUALITIES) {
      const mesh = createMeshMaterial(quality);
      expect(mesh.transparent).toBe(true);
      expect(mesh.depthWrite).toBe(false);
      expect(mesh.opacity).toBeLessThan(1);
      mesh.dispose();
    }
  });
});

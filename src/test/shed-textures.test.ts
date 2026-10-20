import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  FRAME_LOOK,
  SHEET_LOOK,
  coolingPadTexture,
  createConcreteMaterial,
  createCurtainMaterial,
  createLitterMaterial,
  createMemberMaterial,
  createMeshMaterial,
  createSheetMaterial,
  createWallMaterial,
  disposeMaterial,
  resetShedTextures,
} from '@/components/farm/scene/shedMaterials';
import { InstanceSet, addSegment } from '@/components/farm/scene/instancing';
import { ROOF_SHEET_OPTIONS } from '@/types/farm';

/** A 2D context that records what is drawn, so the procedural textures can be built without a real canvas. */
function fakeContext() {
  const calls: string[] = [];
  const record = (name: string) => () => {
    calls.push(name);
  };
  return {
    calls,
    context: {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: record('fillRect'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
    },
  };
}

describe('shed textures', () => {
  let drawn: ReturnType<typeof fakeContext>;
  beforeEach(() => {
    resetShedTextures();
    drawn = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawn.context as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    resetShedTextures();
  });

  it('draws each corrugation once and repeats it along the shed', () => {
    for (const { value } of ROOF_SHEET_OPTIONS) {
      const look = SHEET_LOOK[value];
      const material = createSheetMaterial(value, 'high', 20, 4);
      expect(material.map, value).toBeInstanceOf(THREE.Texture);
      expect(material.bumpMap, value).toBe(material.map);
      if (look.profile === 'straw') {
        expect(material.map!.repeat.x).toBeCloseTo(4 / 0.6, 6);
      } else {
        // Finer than 12 cm only shimmers on screen, so GI's 76 mm waves are drawn at 12 cm.
        expect(material.map!.repeat.y, value).toBeCloseTo(20 / Math.max(look.pitch, 0.12), 6);
      }
      disposeMaterial(material);
    }
    expect(drawn.calls).toContain('fillRect');
    expect(drawn.calls).toContain('stroke'); // the straw strands
  });

  it('gives each sheet its own texture copy, disposed with the material', () => {
    const a = createSheetMaterial('gi-sheet', 'balanced', 10, 3);
    const b = createSheetMaterial('gi-sheet', 'balanced', 30, 3);
    expect(a.map).not.toBe(b.map);
    expect(a.map!.repeat.y).not.toBe(b.map!.repeat.y);
    const dispose = vi.spyOn(a.map!, 'dispose');
    disposeMaterial(a);
    expect(dispose).toHaveBeenCalled();
    disposeMaterial(b);
  });

  it('draws plain colour on lite', () => {
    expect(createSheetMaterial('galvalume', 'lite', 10, 3).map).toBeNull();
    expect(createWallMaterial('lite').map).toBeNull();
    expect(createLitterMaterial('lite').map).toBeNull();
    expect(createMeshMaterial('lite').alphaMap).toBeNull();
    expect(drawn.calls).toHaveLength(0);
  });

  it('builds the wall, litter, wire mesh and cooling pad textures once and shares them', () => {
    const wall = createWallMaterial('high');
    const litter = createLitterMaterial('high');
    const mesh = createMeshMaterial('high');
    expect(wall.map).toBeInstanceOf(THREE.Texture);
    expect(litter.map).toBeInstanceOf(THREE.Texture);
    expect(mesh.alphaMap?.repeat.x).toBe(5); // a 25 mm grid: 40 wires a metre on metre UVs
    expect(mesh.transparent && !mesh.depthWrite).toBe(true);
    expect(createWallMaterial('balanced').map).toBe(wall.map);
    const pad = coolingPadTexture();
    expect(pad).toBe(coolingPadTexture());
    resetShedTextures();
    expect(coolingPadTexture()).not.toBe(pad);
  });

  it('gives every frame its own look', () => {
    expect(FRAME_LOOK['bamboo-wood'].truss).toBe(false);
    expect(FRAME_LOOK['bamboo-wood'].post.round).toBe(true);
    expect(FRAME_LOOK['rcc-pillars'].post.size).toBeGreaterThan(FRAME_LOOK['steel-truss'].post.size);
    const steel = createMemberMaterial(FRAME_LOOK['steel-truss'].member);
    expect(`#${steel.color.getHexString()}`).toBe(FRAME_LOOK['steel-truss'].member.color);
    expect(createCurtainMaterial().side).toBe(THREE.DoubleSide);
    expect(createConcreteMaterial().roughness).toBeGreaterThan(0.9);
  });
});

describe('instancing', () => {
  const matrixOf = (set: InstanceSet, index: number) => new THREE.Matrix4().fromArray(set.matrices, index * 16);

  it('records a matrix and a colour per instance', () => {
    const set = new InstanceSet().add([1, 2, 3], 2, '#ff0000').add([0, 0, 0], [1, 2, 3]);
    expect(set.count).toBe(2);
    expect(set.matrices).toHaveLength(32);
    expect(set.colors.slice(0, 3)).toEqual([1, 0, 0]);
    const position = new THREE.Vector3().setFromMatrixPosition(matrixOf(set, 0));
    expect(position.toArray()).toEqual([1, 2, 3]);
  });

  it('stretches a unit cylinder from one point to the other, at any angle', () => {
    const cases: Array<[[number, number, number], [number, number, number]]> = [
      [[0, 0, 0], [0, 3, 0]],
      [[-2, 1, 0], [2, 1, 0]],
      [[0, 0, -5], [0, 0, 5]],
      [[1, 0, 1], [3, 2, -1]],
    ];
    for (const [a, b] of cases) {
      const set = addSegment(new InstanceSet(), a, b, 0.05);
      const matrix = matrixOf(set, 0);
      // The unit cylinder runs from y = -0.5 to +0.5.
      const start = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix);
      const end = new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix);
      expect(start.distanceTo(new THREE.Vector3(...a)) < 1e-6 || start.distanceTo(new THREE.Vector3(...b)) < 1e-6, `${a} -> ${b}`).toBe(true);
      expect(start.distanceTo(end)).toBeCloseTo(new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)), 6);
    }
  });

  it('skips a segment of no length', () => {
    expect(addSegment(new InstanceSet(), [1, 1, 1], [1, 1, 1], 0.1).count).toBe(0);
  });
});

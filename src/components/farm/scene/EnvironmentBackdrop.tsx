import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { EnvironmentId, SceneReach } from '@/lib/sceneEnvironment';
import type { RenderQuality } from './shedLayout';
import { InstanceSet, InstancedPart } from './instancing';
import { buildBackdropPlan, LANDSCAPE_LOOKS, type FarKind, type Placement, type TreeKind } from './environmentLooks';
import { farShape, fieldShape, groundShape, teaRowShape, terraceShape, treeShapes } from './environmentGeometry';

interface EnvironmentBackdropProps {
  environment: EnvironmentId;
  quality: RenderQuality;
  reach: SceneReach;
  length: number;
  width: number;
  /** Darkens the land under a night or monsoon sky (multiplies every colour). */
  shade: number;
}

/** How much of the fog the far hills take at their crests (their feet take all of it, like valley mist). */
const FAR_HAZE = '0.55';

/** The plan's placements as instances; `color` overrides the placement colour (trunks are coloured by their geometry). */
function toSet(items: Placement[], color?: string) {
  const set = new InstanceSet();
  for (const item of items) set.add([item.x, item.y, item.z], item.scale, color ?? item.color, item.yaw);
  return set;
}

function landMaterial(options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.95, flatShading: true, ...options });
}

/**
 * Material for the far scenery: fogged less towards the crest than the scene fog would, so hills
 * and peaks stay readable on the horizon while their feet melt into the haze over the ground.
 */
function farMaterial(hazeHeight: number) {
  const material = landMaterial({ roughness: 1 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHazeHeight = { value: hazeHeight };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHazeY;').replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
      vec4 hazeWorld = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        hazeWorld = instanceMatrix * hazeWorld;
      #endif
      vHazeY = ( modelMatrix * hazeWorld ).y;`
    );
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHazeY;\nuniform float uHazeHeight;').replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
        #ifdef FOG_EXP2
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        #else
          float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
        #endif
        fogFactor *= mix( 1.0, ${FAR_HAZE}, smoothstep( 0.0, uHazeHeight, vHazeY ) );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
      #endif`
    );
  };
  material.customProgramCacheKey = () => 'far-haze';
  return material;
}

/**
 * The land round the house: the ground disc, crop fields or tea rows or terraces, trees, and the far
 * hills, mesas, dunes or snow peaks. Geometry and materials are built per landscape and quality and
 * disposed when either changes; the instance data per house size (rounded to 5 m).
 */
export function EnvironmentBackdrop({ environment, quality, reach, length, width, shade }: EnvironmentBackdropProps) {
  const look = LANDSCAPE_LOOKS[environment];
  // Rounded up so a drag does not rebuild the land every few centimetres, and the margin still holds.
  const roundLength = Math.ceil(length / 5) * 5;
  const roundWidth = Math.ceil(width / 5) * 5;
  const plan = useMemo(() => buildBackdropPlan(environment, quality, reach, roundLength, roundWidth), [environment, quality, reach, roundLength, roundWidth]);

  const ground = useMemo(() => groundShape(look, plan.clear.flat, plan.groundRadius, quality), [look, plan.clear.flat, plan.groundRadius, quality]);
  useEffect(() => () => ground.dispose(), [ground]);

  // Shapes per landscape: a tree geometry per kind present, a far geometry per kind present.
  const shapes = useMemo(() => {
    const trees = new Map<TreeKind, ReturnType<typeof treeShapes>>();
    for (const mix of look.trees) trees.set(mix.kind, treeShapes(mix.kind));
    const far = new Map<FarKind, THREE.BufferGeometry>();
    for (const mix of look.far) far.set(mix.kind, farShape(mix.kind));
    return {
      trees,
      far,
      field: look.fields ? fieldShape() : null,
      tea: look.teaRows ? teaRowShape() : null,
      terrace: look.terraces ? terraceShape() : null,
    };
  }, [look]);
  useEffect(
    () => () => {
      shapes.trees.forEach(({ wood, leaves }) => {
        wood?.dispose();
        leaves.dispose();
      });
      shapes.far.forEach((geometry) => geometry.dispose());
      shapes.field?.dispose();
      shapes.tea?.dispose();
      shapes.terrace?.dispose();
    },
    [shapes]
  );

  const materials = useMemo(() => {
    const far = new Map<FarKind, THREE.MeshStandardMaterial>();
    for (const mix of look.far) far.set(mix.kind, farMaterial(mix.height[1] * (reach.fogFar / 320) * 0.7));
    return {
      ground: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 }),
      wood: landMaterial(),
      leaves: landMaterial({ side: THREE.DoubleSide, roughness: 0.9 }),
      // Drawn just over the ground without fighting it, however far away.
      field: landMaterial({ roughness: 1, flatShading: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
      far,
    };
  }, [look, reach.fogFar]);
  useEffect(() => {
    const all: THREE.MeshStandardMaterial[] = [materials.ground, materials.wood, materials.leaves, materials.field, ...materials.far.values()];
    for (const material of all) material.color.setScalar(shade);
  }, [materials, shade]);
  useEffect(
    () => () => {
      materials.ground.dispose();
      materials.wood.dispose();
      materials.leaves.dispose();
      materials.field.dispose();
      materials.far.forEach((material) => material.dispose());
    },
    [materials]
  );

  const sets = useMemo(
    () => ({
      trees: plan.trees.map(({ kind, items }) => ({ kind, set: toSet(items), wood: toSet(items, '#ffffff') })),
      far: plan.far.map(({ kind, items }) => ({ kind, set: toSet(items) })),
      fields: toSet(plan.fields),
      tea: toSet(plan.teaRows),
      terraces: toSet(plan.terraces),
    }),
    [plan]
  );
  const shadows = quality !== 'lite';

  return (
    <group name="environment-backdrop" userData={{ trees: plan.trees.reduce((n, t) => n + t.items.length, 0), far: plan.far.reduce((n, f) => n + f.items.length, 0) }}>
      <mesh name="environment-ground" geometry={ground} material={materials.ground} receiveShadow />
      {shapes.field && <InstancedPart name="environment-fields" set={sets.fields} geometry={shapes.field} material={materials.field} receiveShadow />}
      {shapes.tea && <InstancedPart name="environment-tea" set={sets.tea} geometry={shapes.tea} material={materials.leaves} receiveShadow castShadow={shadows} />}
      {shapes.terrace && <InstancedPart name="environment-terraces" set={sets.terraces} geometry={shapes.terrace} material={materials.leaves} receiveShadow />}
      {sets.trees.map(({ kind, set, wood }) => {
        const shape = shapes.trees.get(kind);
        if (!shape) return null;
        return (
          <group key={kind}>
            {shape.wood && <InstancedPart name={`environment-${kind}-wood`} set={wood} geometry={shape.wood} material={materials.wood} castShadow={shadows} />}
            <InstancedPart name={`environment-${kind}`} set={set} geometry={shape.leaves} material={materials.leaves} castShadow={shadows} receiveShadow />
          </group>
        );
      })}
      {sets.far.map(({ kind, set }) => {
        const geometry = shapes.far.get(kind);
        const material = materials.far.get(kind);
        return geometry && material ? <InstancedPart key={kind} name={`environment-${kind}`} set={set} geometry={geometry} material={material} /> : null;
      })}
    </group>
  );
}

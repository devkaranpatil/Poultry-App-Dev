import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Animated materials: the landscape's trees and grass lean in the air.
 *
 * Thousands of blades are drawn as instanced meshes, so their motion is done in the vertex shader (no per-frame
 * matrix updates on the CPU). The mode patches the standard material:
 *  - sway:  plants lean in the air, more the higher the vertex is
 */

/** One clock shared by every animated material; updated once per frame by useSceneClock. */
export const sceneTime = { value: 0 };

export function useSceneClock(enabled = true) {
  useFrame(({ clock }) => {
    if (enabled) sceneTime.value = clock.elapsedTime;
  });
}

export type MotionMode = 'sway';

interface MotionParams {
  /** sway: lean per metre of height. */
  amp?: number;
  /** sway: height (scene y) where leaning starts. */
  base?: number;
}

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uBase;
`;

/** Replacement for three's project_vertex chunk, one per mode. */
const PROJECT: Record<MotionMode, string> = {
  sway: /* glsl */ `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    float swayLift = max( mvPosition.y - uBase, 0.0 ) * uAmp;
    mvPosition.x += sin( uTime * 0.9 + mvPosition.x * 1.7 + mvPosition.z * 1.3 ) * swayLift;
    mvPosition.z += cos( uTime * 0.7 + mvPosition.x * 1.1 + mvPosition.z * 1.9 ) * swayLift * 0.6;
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  `,
};

/** Standard material with a shader-driven motion. Shaders are shared per mode through the cache key. */
export function createMotionMaterial(
  mode: MotionMode,
  parameters: THREE.MeshStandardMaterialParameters,
  motion: MotionParams = {}
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial(parameters);
  material.userData.motion = mode;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneTime;
    shader.uniforms.uAmp = { value: motion.amp ?? 0.03 };
    shader.uniforms.uBase = { value: motion.base ?? 0 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <project_vertex>', PROJECT[mode]);
  };
  material.customProgramCacheKey = () => `motion-${mode}`;
  return material;
}

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Animated materials for the crop and irrigation models.
 *
 * Thousands of leaves and droplets are drawn as instanced meshes, so their motion is done in the
 * vertex shader (no per-frame matrix updates on the CPU). Each mode patches the standard material:
 *  - sway:  plants lean in the air, more the higher the vertex is
 *  - fall:  a drip droplet falls from its emitter and shrinks away before it lands
 *  - spray: a sprinkler droplet flies along an arc from the head, and the head turns slowly
 *  - mist:  a fogger particle drifts outward and down, growing then fading
 *  - flow:  bright bands run along a channel to show moving water
 */

/** One clock shared by every animated material; updated once per frame by useSceneClock. */
export const sceneTime = { value: 0 };

export function useSceneClock(enabled = true) {
  useFrame(({ clock }) => {
    if (enabled) sceneTime.value = clock.elapsedTime;
  });
}

export type MotionMode = 'sway' | 'fall' | 'spray' | 'mist' | 'flow';

interface MotionParams {
  /** sway: lean per metre of height. */
  amp?: number;
  /** sway: height (scene y) where leaning starts. */
  base?: number;
  /** fall/spray/mist: cycles per second. */
  speed?: number;
  /** fall: metres fallen. spray: horizontal reach. mist: horizontal drift. */
  range?: number;
  /** spray: peak height of the arc. mist: metres fallen. */
  rise?: number;
  /** spray: head rotation in radians per second. */
  spin?: number;
}

const HASH = /* glsl */ `
float motionHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
`;

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uBase;
uniform float uSpeed;
uniform float uRange;
uniform float uRise;
uniform float uSpin;
varying float vFlowZ;
${HASH}
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
  fall: /* glsl */ `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      vec3 dropCenter = instanceMatrix[3].xyz;
      float dropPhase = fract( uTime * uSpeed + motionHash( dropCenter.xz * 3.1 + dropCenter.y ) );
      float dropSize = smoothstep( 0.0, 0.06, dropPhase ) * smoothstep( 1.0, 0.82, dropPhase );
      mvPosition = instanceMatrix * mvPosition;
      mvPosition.xyz = dropCenter + ( mvPosition.xyz - dropCenter ) * dropSize + vec3( 0.0, -dropPhase * uRange, 0.0 );
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  `,
  spray: /* glsl */ `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      vec3 sprayCenter = instanceMatrix[3].xyz;
      vec3 sprayDir = normalize( instanceMatrix[0].xyz );
      float sprayAngle = uTime * uSpin;
      mat2 sprayTurn = mat2( cos( sprayAngle ), -sin( sprayAngle ), sin( sprayAngle ), cos( sprayAngle ) );
      sprayDir.xz = sprayTurn * sprayDir.xz;
      float sprayPhase = fract( uTime * uSpeed + motionHash( sprayCenter.xz * 2.3 + sprayDir.xz ) );
      float sprayFade = smoothstep( 1.0, 0.88, sprayPhase );
      mvPosition = instanceMatrix * mvPosition;
      vec3 sprayRel = ( mvPosition.xyz - sprayCenter ) * sprayFade;
      mvPosition.xyz = sprayCenter + sprayDir * ( sprayPhase * uRange ) + vec3( 0.0, 4.0 * uRise * sprayPhase * ( 1.0 - sprayPhase ), 0.0 ) + sprayRel;
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  `,
  mist: /* glsl */ `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      vec3 mistCenter = instanceMatrix[3].xyz;
      vec3 mistDir = normalize( instanceMatrix[0].xyz );
      float mistPhase = fract( uTime * uSpeed + motionHash( mistCenter.xz * 1.7 + mistDir.xz ) );
      float mistSize = sin( mistPhase * 3.14159 ) * ( 0.6 + mistPhase );
      mvPosition = instanceMatrix * mvPosition;
      mvPosition.xyz = mistCenter + ( mvPosition.xyz - mistCenter ) * mistSize
        + vec3( mistDir.x, 0.0, mistDir.z ) * ( mistPhase * uRange )
        + vec3( 0.0, -mistPhase * uRise, 0.0 );
    #endif
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;
  `,
  flow: /* glsl */ `
    vec4 mvPosition = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    vFlowZ = mvPosition.z;
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
    shader.uniforms.uSpeed = { value: motion.speed ?? 0.5 };
    shader.uniforms.uRange = { value: motion.range ?? 0.3 };
    shader.uniforms.uRise = { value: motion.rise ?? 0.2 };
    shader.uniforms.uSpin = { value: motion.spin ?? 0 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <project_vertex>', PROJECT[mode]);

    if (mode === 'flow') {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vFlowZ;')
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb += vec3( 0.04, 0.22, 0.3 ) * step( 0.55, fract( vFlowZ * 1.6 - uTime * 0.5 ) );'
        );
    }
  };
  material.customProgramCacheKey = () => `motion-${mode}`;
  return material;
}

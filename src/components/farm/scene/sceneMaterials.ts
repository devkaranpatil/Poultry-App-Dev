import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Animated materials: the landscape's trees and grass lean in the air, and the flock goes about its day.
 *
 * Thousands of blades are drawn as instanced meshes, so their motion is done in the vertex shader (no per-frame
 * matrix updates on the CPU). The mode patches the standard material:
 *  - sway:  plants lean in the air, more the higher the vertex is
 *  - flock: each bird pecks, looks around and (on the floor) walks a small loop back to its place, on its own
 *           timing, seeded from where it stands (see FLOCK below)
 */

/** One clock shared by every animated material; updated once per frame by useSceneClock. */
export const sceneTime = { value: 0 };

export function useSceneClock(enabled = true) {
  useFrame(({ clock }) => {
    if (enabled) sceneTime.value = clock.elapsedTime;
  });
}

export type MotionMode = 'sway' | 'flock';

interface MotionParams {
  /** sway: lean per metre of height. */
  amp?: number;
  /** sway: height (scene y) where leaning starts. */
  base?: number;
  /** flock: 1 lets the birds walk (a floor flock), 0 keeps them in place (cages). */
  walk?: number;
}

const VERTEX_HEAD = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uBase;
uniform float uWalk;
float motionHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
`;

/**
 * One bird's routine, in its own model space (it faces +z and stands on y = 0, the neck about 20 cm up), before
 * the instance matrix places it. A cycle of 14 to 22 s, offset per bird: the first half feeding (quick pecks down
 * to the litter or the trough), then a short walk round a loop of 20 to 40 cm that ends where it began (floor
 * birds only), then looking about. Every step is continuous, so a bird never jumps.
 */
const FLOCK = /* glsl */ `
    vec3 bird = transformed;
    #ifdef USE_INSTANCING
      vec2 home = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
    #else
      vec2 home = vec2( 0.0 );
    #endif
    float seed = motionHash( home );
    float birdTime = uTime + seed * 53.0;
    float phase = fract( uTime / ( 14.0 + seed * 8.0 ) + seed );

    // The head and neck: everything forward of the breast and above the back.
    float head = smoothstep( 0.04, 0.11, bird.z ) * smoothstep( 0.15, 0.2, bird.y );
    float feeding = 1.0 - smoothstep( 0.46, 0.5, phase );
    float peck = feeding * pow( max( sin( birdTime * 5.5 ), 0.0 ), 6.0 ) * 0.95;
    float look = ( 1.0 - feeding ) * sin( birdTime * 1.1 ) * 0.55;
    vec3 neck = vec3( 0.0, 0.2, 0.07 );
    vec3 fromNeck = bird - neck;
    float pitch = peck * head;
    fromNeck.yz = vec2( fromNeck.y * cos( pitch ) - fromNeck.z * sin( pitch ), fromNeck.y * sin( pitch ) + fromNeck.z * cos( pitch ) );
    float turn = look * head;
    fromNeck.xz = vec2( fromNeck.x * cos( turn ) + fromNeck.z * sin( turn ), -fromNeck.x * sin( turn ) + fromNeck.z * cos( turn ) );
    bird = neck + fromNeck;

    // The walk: once round a small loop to one side, turning with the path, a little bounce in each step.
    float walking = uWalk * step( 0.55, phase ) * ( 1.0 - step( 0.8, phase ) );
    float along = clamp( ( phase - 0.55 ) / 0.25, 0.0, 1.0 ) * walking;
    float loopAngle = along * 6.2831853;
    float side = seed > 0.5 ? 1.0 : -1.0;
    float radius = 0.1 + seed * 0.1;
    float heading = side * loopAngle;
    bird.xz = vec2( bird.x * cos( heading ) + bird.z * sin( heading ), -bird.x * sin( heading ) + bird.z * cos( heading ) );
    bird.xz += vec2( side * radius * ( 1.0 - cos( loopAngle ) ), radius * sin( loopAngle ) );
    bird.y += walking * 0.012 * abs( sin( birdTime * 12.0 ) );

    vec4 mvPosition = vec4( bird, 1.0 );
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
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
  flock: /* glsl */ `${FLOCK}
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
  patchMotion(material, mode, motion);
  return material;
}

/**
 * The matching shadow caster for a moving instanced mesh (set as its customDepthMaterial), so the shadows peck and
 * walk with the birds.
 */
export function createMotionDepthMaterial(mode: MotionMode, motion: MotionParams = {}): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchMotion(material, mode, motion);
  return material;
}

function patchMotion(material: THREE.Material, mode: MotionMode, motion: MotionParams) {
  material.userData.motion = mode;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sceneTime;
    shader.uniforms.uAmp = { value: motion.amp ?? 0.03 };
    shader.uniforms.uBase = { value: motion.base ?? 0 };
    shader.uniforms.uWalk = { value: motion.walk ?? 1 };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <project_vertex>', PROJECT[mode]);
  };
  // uWalk is fixed per material; a floor flock and a caged flock keep separate programs.
  material.customProgramCacheKey = () => `motion-${mode}-${motion.walk ?? 1}-${material.type}`;
}

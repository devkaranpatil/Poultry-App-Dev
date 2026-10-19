import { useCallback, useMemo } from 'react';
import { Grid, Sky, Stars } from '@react-three/drei';
import type { EnvironmentId, SceneReach, SkyId } from '@/lib/sceneEnvironment';
import { SceneAmbience } from '../SceneAmbience';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { groundHeight, hemisphereGround, houseClearance, LANDSCAPE_LOOKS, sceneFog, shaded, SKY_LOOKS } from './environmentLooks';

type RenderQuality = 'high' | 'balanced' | 'lite';

interface SceneEnvironmentProps {
  /** The landscape around the house (from the location, or the grower's pick). */
  environment: EnvironmentId;
  sky: SkyId;
  quality: RenderQuality;
  /**
   * The UI theme. Ignored here: the sky choice sets the mood (a dark UI over a sunny farm reads fine,
   * and night is one click away), so the 3D view looks the same in both themes.
   */
  isDark: boolean;
  /** How far the lights, fog and ground must reach for this house (see sceneReach). */
  reach: SceneReach;
  length: number;
  width: number;
  height: number;
}

/**
 * Everything around the greenhouse: sky, lights, fog, the ground and the living backdrop. The house
 * itself is drawn by GreenhouseModel; this sets the place it stands in. The sky (group `sky-<id>`)
 * sets the light; the landscape (group `environment-<id>`) the land.
 */
export function SceneEnvironment({ environment, sky, quality, reach, length, width, height }: SceneEnvironmentProps) {
  const land = LANDSCAPE_LOOKS[environment];
  const look = SKY_LOOKS[sky];
  const fog = sceneFog(environment, sky, reach, quality);
  const useShadows = quality !== 'lite' && look.shadows;
  const shadowMapSize = quality === 'high' ? 1024 : 512;
  const showDome = quality === 'high' && look.dome !== null;
  // Lower settings had a slightly brighter key to make up for having no sky dome; keep that balance.
  const qualityBoost = quality === 'high' ? 1 : quality === 'balanced' ? 0.9 : 0.8;
  const ambient = look.ambient * (quality === 'high' ? 1 : 1.2);
  const hemi = look.hemisphere.intensity * (quality === 'high' ? 1 : 1.1);

  // The sun stands off along its direction, far enough that the shadow camera sees the whole house.
  const sunDistance = reach.shadowHalf + 60;
  const sun = useMemo(() => {
    const [x, y, z] = look.sun.direction;
    const n = Math.hypot(x, y, z);
    return [(x / n) * sunDistance, (y / n) * sunDistance, (z / n) * sunDistance] as [number, number, number];
  }, [look, sunDistance]);
  const moon = useMemo(() => {
    const [x, y, z] = look.sun.direction;
    const n = Math.hypot(x, y, z);
    const r = fog.far * 1.1;
    return [(x / n) * r, (y / n) * r * 0.55, (z / n) * r] as [number, number, number];
  }, [look, fog.far]);

  // The grid is unlit, so it must be dimmed harder than the lit ground to sit back at night.
  const gridShade = Math.pow(look.shade, 3);
  const clear = houseClearance(Math.ceil(length / 5) * 5, Math.ceil(width / 5) * 5);
  const groundAt = useCallback((x: number, z: number) => groundHeight(land, x, z, clear.flat), [land, clear.flat]);

  return (
    <>
      {/* Behind everything when there is no sky dome; the fog fades the land into it at the horizon. */}
      <color attach="background" args={[fog.color]} />
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />

      <group name={`sky-${sky}`}>
        <ambientLight intensity={ambient} />
        <hemisphereLight args={[look.hemisphere.sky, hemisphereGround(environment, sky), hemi]} />
        {/* Keyed by reach and sky: the shadow camera's frustum is only read when the light is created. */}
        <directionalLight
          key={`${reach.extent}-${sky}`}
          position={sun}
          color={look.sun.color}
          intensity={look.sun.intensity * qualityBoost * (quality === 'high' ? 1 : 1.1)}
          castShadow={useShadows}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
          shadow-bias={-0.00015}
          shadow-normalBias={0.02}
          shadow-camera-left={-reach.shadowHalf}
          shadow-camera-right={reach.shadowHalf}
          shadow-camera-top={reach.shadowHalf}
          shadow-camera-bottom={-reach.shadowHalf}
          shadow-camera-near={1}
          shadow-camera-far={sunDistance + reach.shadowHalf + 60}
        />
        <directionalLight position={[-sun[0], Math.abs(sun[1]) * 0.6 + 10, -sun[2]]} intensity={look.fill.intensity * qualityBoost} color={look.fill.color} />
        <directionalLight position={[0, 16, -50]} intensity={look.rim.intensity * qualityBoost} color={look.rim.color} />

        {showDome && look.dome && (
          <Sky
            distance={450000}
            sunPosition={look.dome.sun}
            turbidity={look.dome.turbidity}
            rayleigh={look.dome.rayleigh}
            mieCoefficient={look.dome.mieCoefficient}
            mieDirectionalG={look.dome.mieDirectionalG}
          />
        )}
        {look.stars && quality !== 'lite' && (
          <Stars radius={fog.far * 1.25} depth={fog.far * 0.3} count={quality === 'high' ? 4000 : 2000} factor={(fog.far * 1.25 * 3.2) / 100} saturation={0} fade speed={0.3} />
        )}
        {sky === 'night' && (
          <mesh name="sky-moon" position={moon}>
            <sphereGeometry args={[fog.far * 0.022, 16, 12]} />
            <meshBasicMaterial color="#f3f4ff" fog={false} />
          </mesh>
        )}
      </group>

      <group name={`environment-${environment}`}>
        {land.grid && (
          // A faint grid near the house, in the soil's own colour, for a sense of scale.
          <Grid
            position={[0, -0.02, 0]}
            args={[reach.grid, reach.grid]}
            cellSize={quality === 'lite' ? 2.5 : 2}
            cellThickness={0.45}
            cellColor={shaded(land.grid.cell, gridShade)}
            sectionSize={10}
            sectionThickness={0.9}
            sectionColor={shaded(land.grid.section, gridShade)}
            fadeDistance={Math.max(70, reach.extent * 1.1)}
            fadeStrength={1.5}
          />
        )}
        <EnvironmentBackdrop environment={environment} quality={quality} reach={reach} length={length} width={width} shade={look.shade} />
        {/* Living backdrop: grass, clouds, pollen or fireflies */}
        <SceneAmbience
          length={length}
          width={width}
          height={height}
          quality={quality}
          grassColors={land.grass}
          grassDensity={land.grassDensity}
          groundAt={groundAt}
          clouds={look.clouds}
          moteColor={look.motes}
          shade={look.shade}
        />
      </group>
    </>
  );
}

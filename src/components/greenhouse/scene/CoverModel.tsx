import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CoverMaterial, GreenhouseType, SideVentilation } from '@/types/greenhouse';
import { InstanceSet, InstancedPart, addSegment } from './instancing';
import { visibleRadius, type RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { endWallGeometry, lift, pipeGeometry, sweptSheet, type Rect } from './structureGeometry';
import { archSegments, fullArch, sideOpening, spaced, spanProfile, type Point2, type StructureLayout } from './structureLayout';
import { createCoverMaterial, createInsectNetMaterial, MEMBER_RADIUS } from './structureMaterials';

/**
 * The skin of the building. A polyhouse gets `roof-cover` (film over every span, the insect-netted
 * ridge vents, aluminium film profiles, or glazing bars for glass), `side-wall-cover` (the fixed film
 * above and below the side vent band) and `end-wall-cover` (gable ends with the entry and pad openings
 * cut out). A shade-net house gets `shade-net-structure`: the net, its cable grid, and for the flat
 * house the guy wires to ground anchors.
 */

interface CoverModelProps {
  layout: StructureLayout;
  cover: CoverMaterial;
  greenhouseType: GreenhouseType;
  sideVentilation: SideVentilation;
  quality: RenderQuality;
  /** Opening in the front end wall for the antechamber or door. */
  entry: { halfWidth: number; height: number };
  /** Opening in the back end wall for the cooling pad (climate-controlled only). */
  padOpening: Rect | null;
}

/** The covers' geometry, built once per layout and option set. Pure apart from the GPU objects it returns. */
export function buildCoverGeometry(layout: StructureLayout, quality: RenderQuality, sideVentilation: SideVentilation, entry: CoverModelProps['entry'], padOpening: Rect | null) {
  const { gutterHeight: G, halfLength, halfWidth, spanCentres } = layout;
  const segments = archSegments(quality);
  const profile = spanProfile(layout, segments);
  const arch = fullArch(layout, segments);
  const z0 = -halfLength;
  const z1 = halfLength;

  const roof = sweptSheet(profile.arches, spanCentres, G, z0, z1);
  const vent = profile.vent ? sweptSheet([[[profile.vent.x, profile.vent.low], [profile.vent.x, profile.vent.high]]], spanCentres, G, z0, z1) : null;

  const opening = sideOpening(G);
  const bands: Point2[][] = sideVentilation === 'none' ? [[[0, 0], [0, G]]] : [[[0, 0], [0, opening.bottom]], [[0, opening.top], [0, G]]];
  const sides = sweptSheet(bands, [-halfWidth - 0.015, halfWidth + 0.015], 0, z0, z1);

  const entryHole: Rect = { x0: -entry.halfWidth, y0: 0.04, x1: entry.halfWidth, y1: Math.min(entry.height, G - 0.05) };
  const front = endWallGeometry(spanCentres, arch, halfWidth, G, entry.halfWidth > 0 ? [entryHole] : []);
  const back = endWallGeometry(spanCentres, arch, halfWidth, G, padOpening ? [padOpening] : []);
  return { roof, vent, sides, front, back, arch, profile, opening };
}

/** Aluminium glazing bar half-width, metres (bars are about 30 mm wide). */
const GLAZING_BAR = 0.014;
const ALUMINIUM = '#d7dde3';

function RoofDetails({ layout, glass, quality, arches, opening }: { layout: StructureLayout; glass: boolean; quality: RenderQuality; arches: Point2[][]; opening: { bottom: number; top: number } }) {
  const built = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.3 });
    const set = new InstanceSet();
    const { gutterHeight: G, halfLength, halfWidth, length, gutterX, spanCentres } = layout;
    let geometry: THREE.BufferGeometry = geo.square();
    let owned: THREE.BufferGeometry | null = null;
    const mullions = new InstanceSet();
    if (glass) {
      // Glass reads as glass by its frame: aluminium glazing bars over the roof every 1.2 m (one pane
      // wide) at every quality, crossed by bars along the length at the profile's knees, and a grid of
      // mullions and transoms in the side walls. Lite draws them a little fatter so they stay lines.
      const bar = visibleRadius(GLAZING_BAR, quality);
      owned = pipeGeometry(arches.map((line) => lift(line)), bar, 'box');
      geometry = owned;
      for (const c of spanCentres) for (const z of spaced(-halfLength, halfLength, 1.2, 220)) set.add([c, G + 0.012, z], 1, ALUMINIUM);
      for (const c of spanCentres) {
        for (const line of arches) {
          // Every other knee of the profile (the gutter ends sit on the gutter already).
          line.slice(1, -1).forEach(([x, y], i) => {
            if (i % 2 === 0 || i === line.length - 3) mullions.add([c + x, G + y + 0.014, 0], [bar, length, bar], ALUMINIUM, 0, Math.PI / 2);
          });
        }
      }
      for (const x of [-halfWidth - 0.02, halfWidth + 0.02]) {
        for (const z of spaced(-halfLength, halfLength, 1.2, 220)) mullions.add([x, G / 2, z], [bar, G, bar], ALUMINIUM);
        for (const y of [0.3, opening.bottom, opening.top, G - 0.06]) mullions.add([x, y, 0], [bar, length, bar], ALUMINIUM, 0, Math.PI / 2);
      }
    } else {
      // Aluminium profiles that lock the film with zigzag wire, along every gutter and ridge. The
      // square box is 2 deep, so half the length spans the house exactly.
      for (const x of gutterX) set.add([x, G + 0.03, 0], [0.025, 0.03, length / 2], '#d4d9de');
      if (layout.rise > 0) for (const c of spanCentres) set.add([c, G + layout.rise + 0.015, 0], [0.02, 0.03, length / 2], '#d4d9de');
    }
    return { material, set, geometry, mullions, dispose: () => { material.dispose(); owned?.dispose(); } };
  }, [layout, glass, quality, arches, opening]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <>
      <InstancedPart name={glass ? 'glazing-bars' : 'film-profiles'} set={built.set} geometry={built.geometry} material={built.material} />
      <InstancedPart name="glazing-mullions" set={built.mullions} geometry={geo.square()} material={built.material} />
    </>
  );
}

/** Cables, guy wires and anchors of a flat shade-net house. */
function NetRigging({ layout, quality }: { layout: StructureLayout; quality: RenderQuality }) {
  const built = useMemo(() => {
    const steel = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.4 });
    const concrete = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
    const cables = new InstanceSet();
    const anchors = new InstanceSet();
    const { gutterHeight: G, halfLength, halfWidth, length, width, gutterX, frameZ } = layout;
    const top = G + 0.02;
    // The cable grid the net lies on, heavier round the perimeter.
    const cable = (edge: boolean) => visibleRadius(edge ? MEMBER_RADIUS.cable * 1.8 : MEMBER_RADIUS.cable, quality);
    gutterX.forEach((x, i) => {
      const r = cable(i === 0 || i === gutterX.length - 1);
      cables.add([x, top, 0], [r, length, r], '#9aa1a8', 0, Math.PI / 2);
    });
    frameZ.forEach((z, i) => {
      const r = cable(i === 0 || i === frameZ.length - 1);
      cables.add([0, top, z], [r, width, r], '#9aa1a8', 0, 0, Math.PI / 2);
    });
    // Every perimeter post is held by a guy wire to a ground anchor outside the house.
    const reach = Math.min(2, G * 0.5);
    const guy = (x: number, z: number, dx: number, dz: number) => {
      const ax = x + dx * reach;
      const az = z + dz * reach;
      addSegment(cables, [x, G - 0.05, z], [ax, 0.08, az], visibleRadius(MEMBER_RADIUS.cable * 1.3, quality), '#8b929a');
      anchors.add([ax, 0.06, az], [0.3, 0.12, 0.3], '#a6a39b');
    };
    const step = quality === 'lite' ? 2 : 1;
    gutterX.forEach((x, i) => {
      if (i % step !== 0 && i !== gutterX.length - 1) return;
      guy(x, -halfLength, 0, -1);
      guy(x, halfLength, 0, 1);
    });
    frameZ.forEach((z, i) => {
      if (i % step !== 0 && i !== frameZ.length - 1) return;
      guy(-halfWidth, z, -1, 0);
      guy(halfWidth, z, 1, 0);
    });
    return { steel, concrete, cables, anchors, dispose: () => { steel.dispose(); concrete.dispose(); } };
  }, [layout, quality]);
  useEffect(() => () => built.dispose(), [built]);

  return (
    <>
      <InstancedPart name="net-cables" set={built.cables} geometry={geo.cylinder()} material={built.steel} />
      <InstancedPart name="net-anchors" set={built.anchors} geometry={geo.box()} material={built.concrete} />
    </>
  );
}

export function CoverModel({ layout, cover, greenhouseType, sideVentilation, quality, entry, padOpening }: CoverModelProps) {
  const geometry = useMemo(
    () => buildCoverGeometry(layout, quality, greenhouseType === 'shade-net' ? 'none' : sideVentilation, entry, padOpening),
    [layout, quality, greenhouseType, sideVentilation, entry, padOpening]
  );
  useEffect(
    () => () => {
      [geometry.roof, geometry.vent, geometry.sides, geometry.front, geometry.back].forEach((g) => g?.dispose());
    },
    [geometry]
  );
  const material = useMemo(() => createCoverMaterial(cover, quality), [cover, quality]);
  const net = useMemo(() => createInsectNetMaterial(quality), [quality]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => net.dispose(), [net]);
  const halfLength = layout.halfLength;

  if (greenhouseType === 'shade-net') {
    return (
      <group name="shade-net-structure" userData={{ cover, tensile: layout.tensile }}>
        <mesh name="shade-net-roof" geometry={geometry.roof} material={material} renderOrder={2} />
        <mesh name="shade-net-walls" geometry={geometry.sides} material={material} renderOrder={2} />
        <mesh name="shade-net-front" geometry={geometry.front} material={material} position={[0, 0, halfLength + 0.015]} renderOrder={2} />
        <mesh name="shade-net-back" geometry={geometry.back} material={material} position={[0, 0, -halfLength - 0.015]} renderOrder={2} />
        {layout.tensile ? <NetRigging layout={layout} quality={quality} /> : null}
      </group>
    );
  }

  return (
    <>
      <group name="roof-cover" userData={{ cover, vent: Boolean(geometry.vent) }}>
        <mesh name="roof-cover-film" geometry={geometry.roof} material={material} castShadow={false} receiveShadow={quality === 'high'} renderOrder={2} />
        {geometry.vent ? <mesh name="roof-vent-net" geometry={geometry.vent} material={net} renderOrder={2} /> : null}
        <RoofDetails layout={layout} glass={cover === 'glass'} quality={quality} arches={geometry.profile.arches} opening={geometry.opening} />
      </group>
      <group name="side-wall-cover">
        <mesh name="side-wall-film" geometry={geometry.sides} material={material} renderOrder={2} />
      </group>
      <group name="end-wall-cover">
        <mesh name="end-wall-front" geometry={geometry.front} material={material} position={[0, 0, halfLength + 0.012]} renderOrder={2} />
        <mesh name="end-wall-back" geometry={geometry.back} material={material} position={[0, 0, -halfLength - 0.012]} renderOrder={2} />
      </group>
    </>
  );
}

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { StructureMaterial } from '@/types/greenhouse';
import { InstanceSet, InstancedPart, addSegment } from './instancing';
import { visibleRadius, type RenderQuality } from './cropLayout';
import { geo } from './sceneGeometry';
import { gutterChannel, lift, pipeGeometry, type Point3 } from './structureGeometry';
import { archSegments, roofY, spaced, spanProfile, type StructureLayout } from './structureLayout';
import { FRAME_LOOK, MEMBER_RADIUS } from './structureMaterials';
import { Reveal } from './transitions';

/**
 * The structure: footings, columns, arches, trusses, purlins, gutters and bracing. Each kind of
 * member is one group named `frame-*` (so the frame can be clicked as one part), drawn as instanced
 * meshes: a 200 x 100 m house is still a few dozen draw calls.
 */

interface FrameModelProps {
  layout: StructureLayout;
  structure: StructureMaterial;
  quality: RenderQuality;
  /** Half the width of the entry opening in the front end wall, kept clear of end-wall posts. */
  entryHalf: number;
}

interface Part {
  name: string;
  set: InstanceSet;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow?: boolean;
}

const CONCRETE = '#a9a69e';
const GUTTER = '#b9c0c6';
const DOWNPIPE = '#d5d8db';
const LASHING = '#4a3a26';
const NODE = '#8f6a35';

/** Builds every member as instanced parts, grouped by the frame-* group they belong to. */
export function buildFrameParts(layout: StructureLayout, structure: StructureMaterial, quality: RenderQuality, entryHalf: number) {
  const look = FRAME_LOOK[structure];
  const t = look.thickness;
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  const metal = own(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: look.metalness, roughness: look.roughness }));
  const concrete = own(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 }));
  const sheet = own(new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.45, roughness: 0.35, side: THREE.DoubleSide }));
  const straight = look.profile === 'box' ? geo.square() : look.bamboo ? geo.cylinder() : geo.cylinderRound();

  const groups: Record<string, Part[]> = {
    'frame-foundations': [],
    'frame-columns': [],
    'frame-arches': [],
    'frame-trusses': [],
    'frame-purlins': [],
    'frame-gutters': [],
    'frame-bracing': [],
  };
  const part = (group: string, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, castShadow = false) => {
    const set = new InstanceSet();
    groups[group].push({ name, set, geometry, material, castShadow });
    return set;
  };

  const { gutterHeight: G, halfLength, halfWidth, length, gutterX, frameZ, spanCentres, spanWidth } = layout;
  const halfSpan = spanWidth / 2;
  const profile = spanProfile(layout, archSegments(quality));
  const vent = profile.vent;
  /** Height of the roof above the gutter at x across a span, following the lowered half of a vented arch. */
  const yAt = (x: number) => roofY(layout.roofType, halfSpan, layout.rise, x) * (vent && x > 0 ? vent.low / vent.high : 1);
  const color = look.color;
  /** Bracing and truss webs are the thinnest members; lite keeps them at least a visible line wide. */
  const braceRadius = visibleRadius(MEMBER_RADIUS.brace * t, quality);

  // Footings under every column, and the low concrete kerb the side curtains close onto.
  const footings = part('frame-foundations', 'footings', geo.box(), concrete);
  for (const x of gutterX) for (const z of frameZ) footings.add([x, 0.05, z], [0.45, 0.1, 0.45], CONCRETE);
  if (!layout.tensile) {
    const kerb = part('frame-foundations', 'kerb', geo.box(), concrete);
    for (const side of [-1, 1]) kerb.add([side * halfWidth, 0.12, 0], [0.2, 0.24, length + 0.2], '#b3b0a7');
    kerb.add([0, 0.12, -halfLength], [layout.width, 0.24, 0.2], '#b3b0a7');
    const segment = halfWidth - entryHalf;
    if (segment > 0.05) {
      for (const side of [-1, 1]) kerb.add([side * (entryHalf + segment / 2), 0.12, halfLength], [segment, 0.24, 0.2], '#b3b0a7');
    }
  }

  // Columns on every gutter line at every frame line.
  const columnRadius = MEMBER_RADIUS.column * t * (layout.tensile ? 0.9 : 1);
  const columns = part('frame-columns', 'columns', straight, metal, true);
  for (const x of gutterX) for (const z of frameZ) columns.add([x, G / 2, z], [columnRadius, G, columnRadius], color);

  // End-wall posts carry the film up to the arch; the front ones frame the entry instead of blocking it.
  if (!layout.tensile && layout.rise > 0) {
    const posts = part('frame-columns', 'end-wall-posts', straight, metal);
    for (const z of [-halfLength, halfLength]) {
      const xs = new Set<number>();
      for (const c of spanCentres) for (const dx of [-halfSpan / 2, 0, halfSpan / 2]) xs.add(Number((c + dx).toFixed(3)));
      if (z > 0) {
        for (const x of [...xs]) if (Math.abs(x) < entryHalf + 0.25) xs.delete(x);
        xs.add(-entryHalf - 0.05);
        xs.add(entryHalf + 0.05);
      }
      for (const x of xs) {
        const local = x - spanCentres.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best), spanCentres[0]);
        const height = G + yAt(local) - 0.02;
        posts.add([x, height / 2, z], [MEMBER_RADIUS.purlin * t, height, MEMBER_RADIUS.purlin * t], color);
      }
    }
  }

  if (look.bamboo) {
    // Lashed joints at every column head, and growth nodes along the poles.
    const lashings = part('frame-columns', 'lashings', geo.cylinderRound(), concrete);
    for (const x of gutterX) for (const z of frameZ) lashings.add([x, G - 0.05, z], [columnRadius * 1.25, 0.16, columnRadius * 1.25], LASHING);
    if (quality !== 'lite') {
      const nodes = part('frame-columns', 'nodes', geo.cylinder(), metal);
      const levels = spaced(0.45, G - 0.3, 0.45, 12);
      for (const x of gutterX) for (const z of frameZ) for (const y of levels) nodes.add([x, y, z], [columnRadius * 1.12, 0.035, columnRadius * 1.12], NODE);
    }
  }

  // Arches (hoops) over every span at every frame line: one shared geometry, many instances.
  if (!layout.tensile) {
    const hoop = own(pipeGeometry(profile.arches.map((line) => lift(line)), MEMBER_RADIUS.arch * t, look.profile, quality === 'lite' ? 5 : 8));
    const arches = part('frame-arches', 'arches', hoop, metal, true);
    for (const c of spanCentres) for (const z of frameZ) arches.add([c, G, z], 1, color);

    // Trusses: a bottom chord at gutter height with web members up to the arch.
    if (layout.rise > 0) {
      const chord = own(pipeGeometry([[[-halfSpan, 0, 0], [halfSpan, 0, 0]]], MEMBER_RADIUS.chord * t, look.profile, 6));
      const webLines: Point3[][] = [];
      for (const side of [-1, 1]) {
        const x = (side * halfSpan) / 2;
        webLines.push([[x, 0, 0], [x, yAt(x), 0]]);
        if (quality !== 'lite') webLines.push([[0, 0, 0], [x, yAt(x), 0]]);
      }
      webLines.push([[0, 0, 0], [0, vent ? vent.low : layout.rise, 0]]);
      const web = own(pipeGeometry(webLines, braceRadius, look.profile, 6));
      const chords = part('frame-trusses', 'chords', chord, metal);
      const webs = part('frame-trusses', 'webs', web, metal);
      for (const c of spanCentres) {
        for (const z of frameZ) {
          chords.add([c, G, z], 1, color);
          webs.add([c, G, z], 1, color);
        }
      }
    }

    // Purlins run the full length: at the ridge, half way up each slope, and along every gutter line.
    const purlins = part('frame-purlins', 'purlins', straight, metal);
    const along = (x: number, y: number, r: number) => purlins.add([x, y, 0], [r, length, r], color, 0, Math.PI / 2);
    for (const x of gutterX) along(x, G, MEMBER_RADIUS.purlin * t);
    if (layout.rise > 0) {
      for (const c of spanCentres) {
        along(c, G + layout.rise, MEMBER_RADIUS.purlin * t);
        if (vent) along(c, G + vent.low, MEMBER_RADIUS.purlin * t);
        for (const side of [-1, 1]) along(c + (side * halfSpan) / 2, G + yAt((side * halfSpan) / 2), MEMBER_RADIUS.purlin * t * 0.85);
      }
    } else {
      for (const x of spaced(-halfWidth, halfWidth, 2, 40).slice(1, -1)) along(x, G, MEMBER_RADIUS.purlin * t * 0.85);
    }

    // Sheet gutters: 500 mm valley gutters between spans, narrower ones on the outer walls, with downpipes.
    const channel = own(gutterChannel(1, 0.14));
    const gutters = part('frame-gutters', 'gutters', channel, sheet);
    const downpipes = part('frame-gutters', 'downpipes', geo.cylinderRound(), concrete);
    gutterX.forEach((x, i) => {
      const outer = i === 0 || i === gutterX.length - 1;
      gutters.add([x, G + 0.04, 0], [outer ? 0.28 : 0.5, 1, length + 0.3], GUTTER);
      for (const z of [-halfLength - 0.12, halfLength + 0.12]) downpipes.add([x, (G - 0.1) / 2 + 0.05, z], [0.045, G - 0.1, 0.045], DOWNPIPE);
    });

    // Cross bracing in the end bays of both side walls.
    const braces = part('frame-bracing', 'braces', straight, metal);
    const bays = frameZ.length > 2 ? [[frameZ[0], frameZ[1]], [frameZ[frameZ.length - 2], frameZ[frameZ.length - 1]]] : [[frameZ[0], frameZ[1]]];
    for (const x of [-halfWidth, halfWidth]) {
      for (const [z0, z1] of bays) {
        addSegment(braces, [x, 0.3, z0], [x, G - 0.15, z1], braceRadius, color);
        addSegment(braces, [x, 0.3, z1], [x, G - 0.15, z0], braceRadius, color);
      }
    }
    // And a pair of roof braces in each end bay, from the gutter to the ridge.
    if (layout.rise > 0 && quality !== 'lite') {
      for (const c of spanCentres) {
        for (const [z0, z1] of bays) {
          addSegment(braces, [c - halfSpan, G, z0], [c, G + (vent ? vent.low : layout.rise), z1], braceRadius, color);
        }
      }
    }
  }

  return { groups, dispose: () => owned.forEach((item) => item.dispose()) };
}

export function FrameModel({ layout, structure, quality, entryHalf }: FrameModelProps) {
  const built = useMemo(() => buildFrameParts(layout, structure, quality, entryHalf), [layout, structure, quality, entryHalf]);
  useEffect(() => () => built.dispose(), [built]);
  const castShadow = quality !== 'lite';

  return (
    <group name="frame" userData={{ structure, spans: layout.spans, bays: layout.bays }}>
      {Object.entries(built.groups).map(([group, parts], i) =>
        parts.length === 0 ? null : (
          <Reveal key={group} kind="grow" delay={i * 0.06} duration={0.42}>
            <group name={group}>
              {parts.map((p) => (
                <InstancedPart key={p.name} name={p.name} set={p.set} geometry={p.geometry} material={p.material} castShadow={castShadow && p.castShadow} receiveShadow={false} />
              ))}
            </group>
          </Reveal>
        )
      )}
    </group>
  );
}

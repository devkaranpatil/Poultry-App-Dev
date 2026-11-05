import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedPart } from './instancing';
import { InstanceSet, addSegment } from './instanceSet';
import { geo } from './sceneGeometry';
import { CAGE, FITTING_CAP, PLINTH, type InteriorLayout, type RenderQuality, type ShedLayout } from './shedLayout';
import { createConcreteMaterial, createLitterMaterial } from './shedMaterials';
import { metrePlane, useDisposal } from './structureHelpers';

/**
 * Inside the shed, laid out by buildInteriorLayout (shedLayout.ts): the litter or cage floor, the flock, the A-type
 * cages, the feeders and drinkers, and outside, the feed silo and the water tank.
 */

/** The top of the litter, where floor birds and fittings stand. */
export const LITTER_TOP = PLINTH + 0.03;

/* ------------------------------------------------------------------------------------------------ floor */

/** Deep litter for a floor flock; a concrete floor with a manure strip under each cage row for layers in cages. */
export function LitterFloor({ layout, interior, quality }: { layout: ShedLayout; interior: InteriorLayout; quality: RenderQuality }) {
  const width = layout.halfWidth * 2 - 0.24;
  const length = layout.halfLength * 2 - 0.24;
  const built = useMemo(
    () => ({
      floor: metrePlane(width, length),
      litter: createLitterMaterial(quality),
      concrete: createConcreteMaterial(),
      manure: new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 1 }),
    }),
    [width, length, quality]
  );
  const items = useMemo(() => Object.values(built), [built]);
  useDisposal(items);
  if (interior.mode === 'cage') {
    return (
      <group name="cages-floor">
        <mesh geometry={built.floor} material={built.concrete} rotation={[-Math.PI / 2, 0, 0]} position={[0, PLINTH + 0.005, 0]} receiveShadow />
        {interior.cageRows.map((row) => (
          <mesh key={row.x} material={built.manure} rotation={[-Math.PI / 2, 0, 0]} position={[row.x, PLINTH + 0.01, (row.z0 + row.z1) / 2]} receiveShadow>
            <planeGeometry args={[row.tiers[0].outer * 2, row.z1 - row.z0]} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group name="litter">
      <mesh geometry={built.floor} material={built.litter} rotation={[-Math.PI / 2, 0, 0]} position={[0, LITTER_TOP, 0]} receiveShadow />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ birds */

/** Paints every vertex of a geometry one colour, for merging pieces of different colours into one mesh. */
function painted(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  flat.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const colors = new Float32Array(flat.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

let birdGeometry: { body: THREE.BufferGeometry; details: THREE.BufferGeometry } | null = null;

/**
 * A low-poly hen about 32 cm long facing +z, standing on y = 0: the body and head take the plumage colour (one
 * instance colour each), and the comb, wattle, beak and legs are painted into a second mesh.
 */
function chickenGeometry() {
  if (birdGeometry) return birdGeometry;
  const body = mergeGeometries(
    [
      painted(new THREE.SphereGeometry(1, 9, 7).scale(0.11, 0.1, 0.16).translate(0, 0.14, 0), '#ffffff'),
      painted(new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.26, 0.12), '#ffffff'),
      painted(new THREE.ConeGeometry(0.07, 0.14, 6).rotateX(-0.9).translate(0, 0.2, -0.15), '#ffffff'),
    ],
    false
  )!;
  const details = mergeGeometries(
    [
      painted(new THREE.BoxGeometry(0.014, 0.045, 0.065).translate(0, 0.315, 0.12), '#c8261e'),
      painted(new THREE.SphereGeometry(0.02, 6, 4).translate(0, 0.215, 0.17), '#c8261e'),
      painted(new THREE.ConeGeometry(0.016, 0.045, 6).rotateX(Math.PI / 2).translate(0, 0.255, 0.19), '#e3a32c'),
      painted(new THREE.CylinderGeometry(0.01, 0.01, 0.09, 5).translate(-0.04, 0.045, 0), '#e3a32c'),
      painted(new THREE.CylinderGeometry(0.01, 0.01, 0.09, 5).translate(0.04, 0.045, 0), '#e3a32c'),
    ],
    false
  )!;
  birdGeometry = { body, details };
  return birdGeometry;
}

/** The flock: up to BIRD_CAP birds as two instanced meshes, in the breed's colours and slightly varied poses. */
export function BirdFlock({ interior }: { interior: InteriorLayout }) {
  const sets = useMemo(() => {
    const body = new InstanceSet();
    const details = new InstanceSet();
    const ground = interior.mode === 'cage' ? 0 : LITTER_TOP;
    for (const bird of interior.birds) {
      const position: [number, number, number] = [bird.position[0], bird.position[1] + ground, bird.position[2]];
      body.add(position, bird.scale, bird.color, bird.yaw, bird.pitch);
      details.add(position, bird.scale, '#ffffff', bird.yaw, bird.pitch);
    }
    return { body, details };
  }, [interior]);
  const materials = useMemo(
    () => ({
      body: new THREE.MeshStandardMaterial({ roughness: 0.92, vertexColors: true }),
      details: new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }),
    }),
    []
  );
  const items = useMemo(() => Object.values(materials), [materials]);
  useDisposal(items);
  const shape = chickenGeometry();
  return (
    <group name="birds-flock" userData={{ birdsShown: interior.birdsShown, birdsTotal: interior.birdsTotal }}>
      <InstancedPart name="birds-bodies" set={sets.body} geometry={shape.body} material={materials.body} castShadow />
      <InstancedPart name="birds-details" set={sets.details} geometry={shape.details} material={materials.details} />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ cages */

/**
 * A-type layer cages: on each row, every tier is a long wire cage on both faces of the A, divided into cells, on
 * galvanised A-frame legs. Drawn translucent so the birds inside show.
 */
export function CageRows({ interior, quality }: { interior: InteriorLayout; quality: RenderQuality }) {
  const sets = useMemo(() => {
    const cages = new InstanceSet();
    const dividers = new InstanceSet();
    const legs = new InstanceSet();
    const cap = FITTING_CAP[quality] * 3;
    const perRow = Math.max(1, interior.cageRows.length * interior.cageRows[0]?.tiers.length * 2 || 1);
    for (const row of interior.cageRows) {
      const length = row.z1 - row.z0;
      const centre = (row.z0 + row.z1) / 2;
      const top = row.tiers[row.tiers.length - 1].y + CAGE.height;
      for (const side of [-1, 1]) {
        for (const tier of row.tiers) {
          const x = row.x + side * (tier.inner + CAGE.depth / 2);
          cages.add([x, tier.y + CAGE.height / 2, centre], [CAGE.depth, CAGE.height, length]);
          // Cell partitions every 45 cm (four birds to an 18 in cage), fewer when the shed is long.
          const cells = Math.max(1, Math.min(Math.round(length / 0.45), Math.floor(cap / perRow)));
          for (let i = 0; i <= cells; i += 1) {
            dividers.add([x, tier.y + CAGE.height / 2, row.z0 + (i * length) / cells], [CAGE.depth, CAGE.height, 0.006]);
          }
        }
        const foot = row.x + side * row.tiers[0].outer;
        const apex = row.x + side * CAGE.gap;
        const frames = Math.max(2, Math.round(length / 1.2) + 1);
        for (let i = 0; i < frames; i += 1) {
          const z = row.z0 + (i * length) / (frames - 1);
          addSegment(legs, [foot, PLINTH, z], [apex, top + 0.05, z], 0.012);
        }
      }
      addSegment(legs, [row.x, top + 0.05, row.z0], [row.x, top + 0.05, row.z1], 0.015);
    }
    return { cages, dividers, legs };
  }, [interior, quality]);
  const materials = useMemo(
    () => ({
      cage: new THREE.MeshStandardMaterial({ color: '#b7bec4', metalness: 0.4, roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      wire: new THREE.MeshStandardMaterial({ color: '#a7afb6', metalness: 0.45, roughness: 0.45, transparent: true, opacity: 0.7 }),
      leg: new THREE.MeshStandardMaterial({ color: '#8b949c', metalness: 0.45, roughness: 0.45 }),
    }),
    []
  );
  const items = useMemo(() => Object.values(materials), [materials]);
  useDisposal(items);
  return (
    <group name="cages-rows" userData={{ rows: interior.cageRows.length, tiers: interior.cageRows[0]?.tiers.length ?? 0 }}>
      <InstancedPart name="cages-boxes" set={sets.cages} geometry={geo.box()} material={materials.cage} renderOrder={2} />
      <InstancedPart name="cages-dividers" set={sets.dividers} geometry={geo.box()} material={materials.wire} />
      <InstancedPart name="cages-legs" set={sets.legs} geometry={geo.cylinder()} material={materials.leg} castShadow />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ feeding */

/**
 * Manual: hanging tube feeders and bell drinkers. Semi-automatic: pan feeders in rows and nipple lines. Automatic:
 * pans on an auger line fed from a hopper and the silo, and nipple lines with regulators. Cages: a trough along every
 * tier and a nipple line inside it, with a feed trolley on each row when automatic.
 */
export function FeedingModel({ layout, interior, automatic }: { layout: ShedLayout; interior: InteriorLayout; automatic: boolean }) {
  const ground = interior.mode === 'cage' ? PLINTH : LITTER_TOP;
  const sets = useMemo(() => {
    const plastic = new InstanceSet();
    const red = new InstanceSet();
    const steel = new InstanceSet();
    const pipes = new InstanceSet();
    const feed = new InstanceSet();
    const hang = Math.max(layout.eavesHeight - 0.05, 1);
    for (const [x, z] of interior.feeders) {
      plastic.add([x, ground + 0.03, z], [0.22, 0.06, 0.22]);
      plastic.add([x, ground + 0.26, z], [0.11, 0.38, 0.11]);
      addSegment(pipes, [x, ground + 0.45, z], [x, hang, z], 0.004);
    }
    for (const [x, z] of interior.drinkers) {
      red.add([x, ground + 0.2, z], [0.2, 0.22, 0.2]);
      addSegment(pipes, [x, ground + 0.31, z], [x, hang, z], 0.006);
    }
    for (const line of interior.panLines) {
      if (line.y > 0) {
        addSegment(steel, [line.x, ground + line.y, line.z0], [line.x, ground + line.y, line.z1], 0.03);
        addSegment(pipes, [line.x, ground + line.y, line.z0], [line.x, hang, line.z0], 0.004);
        addSegment(pipes, [line.x, ground + line.y, line.z1], [line.x, hang, line.z1], 0.004);
      }
    }
    for (const [x, , z] of interior.pans) {
      plastic.add([x, ground + 0.04, z], [0.18, 0.08, 0.18]);
      const line = interior.panLines.find((candidate) => candidate.x === x);
      if (line && line.y > 0) addSegment(pipes, [x, ground + 0.08, z], [x, ground + line.y, z], 0.015);
    }
    for (const line of interior.nippleLines) {
      const y = interior.mode === 'cage' ? line.y : ground + line.y;
      steel.add([line.x, y, (line.z0 + line.z1) / 2], [0.025, 0.025, line.z1 - line.z0]);
      if (interior.mode !== 'cage') {
        addSegment(pipes, [line.x, y, line.z0], [line.x, hang, line.z0], 0.004);
        red.add([line.x, y + 0.04, line.z1 + 0.1], [0.06, 0.08, 0.08]);
      }
    }
    for (const [x, y, z] of interior.nipples) red.add([x, interior.mode === 'cage' ? y : ground + y, z], [0.008, 0.03, 0.008]);
    for (const trough of interior.troughs) {
      const length = trough.z1 - trough.z0;
      steel.add([trough.x, trough.y, (trough.z0 + trough.z1) / 2], [CAGE.trough, 0.07, length]);
      feed.add([trough.x, trough.y + 0.03, (trough.z0 + trough.z1) / 2], [CAGE.trough * 0.8, 0.02, length]);
    }
    for (const [x, y, z] of interior.hoppers) {
      steel.add([x, interior.mode === 'cage' ? y : ground + y, z], interior.mode === 'cage' ? [1.6, 0.4, 0.5] : [0.5, 0.5, 0.5]);
    }
    // The trolley runs on a rail along the top of each cage row.
    if (interior.mode === 'cage' && interior.hoppers.length > 0) {
      for (const row of interior.cageRows) {
        const top = row.tiers[row.tiers.length - 1].y + CAGE.height + 0.06;
        for (const side of [-1, 1]) steel.add([row.x + side * 0.7, top, (row.z0 + row.z1) / 2], [0.04, 0.04, row.z1 - row.z0]);
      }
    }
    return { plastic, red, steel, pipes, feed };
  }, [interior, layout.eavesHeight, ground]);

  const materials = useMemo(
    () => ({
      plastic: new THREE.MeshStandardMaterial({ color: '#d9622b', roughness: 0.55 }),
      red: new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.5 }),
      steel: new THREE.MeshStandardMaterial({ color: '#b3bac0', metalness: 0.45, roughness: 0.4 }),
      pipe: new THREE.MeshStandardMaterial({ color: '#9aa3a8', metalness: 0.4, roughness: 0.5 }),
      feed: new THREE.MeshStandardMaterial({ color: '#c9a35a', roughness: 1 }),
      silo: new THREE.MeshStandardMaterial({ color: '#c9cfd4', metalness: 0.5, roughness: 0.35 }),
    }),
    []
  );
  const items = useMemo(() => Object.values(materials), [materials]);
  useDisposal(items);

  return (
    <group name="feeding-model" userData={{ feeders: interior.feeders.length, drinkers: interior.drinkers.length, pans: interior.pans.length, nipples: interior.nipples.length }}>
      <InstancedPart name="feeding-plastic" set={sets.plastic} geometry={geo.cylinderRound()} material={materials.plastic} castShadow />
      <InstancedPart name="feeding-drinkers" set={sets.red} geometry={geo.cylinderRound()} material={materials.red} castShadow />
      <InstancedPart name="feeding-lines" set={sets.steel} geometry={geo.box()} material={materials.steel} castShadow />
      <InstancedPart name="feeding-pipes" set={sets.pipes} geometry={geo.cylinder()} material={materials.pipe} />
      <InstancedPart name="feeding-feed" set={sets.feed} geometry={geo.box()} material={materials.feed} />
      {automatic && interior.silo ? <FeedSilo position={interior.silo} material={materials.silo} /> : null}
    </group>
  );
}

/** A galvanised bulk feed bin on four legs, beside the back of the shed. */
function FeedSilo({ position, material }: { position: [number, number]; material: THREE.Material }) {
  return (
    <group name="feeding-silo" position={[position[0], 0, position[1]]}>
      <mesh position={[0, 3.0, 0]} material={material} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 2.2, 16]} />
      </mesh>
      <mesh position={[0, 4.35, 0]} material={material} castShadow>
        <coneGeometry args={[0.9, 0.5, 16]} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI, 0, 0]} material={material} castShadow>
        <coneGeometry args={[0.9, 0.8, 16]} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} position={[Math.cos((k * Math.PI) / 2 + Math.PI / 4) * 0.75, 1.0, Math.sin((k * Math.PI) / 2 + Math.PI / 4) * 0.75]} material={material}>
          <boxGeometry args={[0.06, 2.0, 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ extras */

/** Hover brooders for the chicks, and outside the overhead water tank on its stand. */
export function SiteExtras({ layout, interior }: { layout: ShedLayout; interior: InteriorLayout }) {
  const materials = useMemo(
    () => ({
      hover: new THREE.MeshStandardMaterial({ color: '#d4d8db', metalness: 0.4, roughness: 0.4, side: THREE.DoubleSide }),
      tank: new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.6 }),
      stand: new THREE.MeshStandardMaterial({ color: '#6f7a83', metalness: 0.4, roughness: 0.5 }),
    }),
    []
  );
  const items = useMemo(() => Object.values(materials), [materials]);
  useDisposal(items);
  const { halfWidth: hw, halfLength: hl } = layout;
  const tankX = hw + 1.6;
  const tankZ = -hl + 1.2;
  return (
    <group name="site-extras">
      {interior.brooders.length > 0 ? (
        <group name="birds-brooders">
          {interior.brooders.map(([x, z]) => (
            <mesh key={`${x}|${z}`} position={[x, LITTER_TOP + 0.75, z]} material={materials.hover} castShadow>
              <coneGeometry args={[0.6, 0.35, 16, 1, true]} />
            </mesh>
          ))}
        </group>
      ) : null}
      <group name="site-tank" position={[tankX, 0, tankZ]}>
        <mesh position={[0, 3.0, 0]} material={materials.tank} castShadow>
          <cylinderGeometry args={[0.6, 0.6, 1.0, 16]} />
        </mesh>
        <mesh position={[0, 2.45, 0]} material={materials.stand}>
          <boxGeometry args={[1.3, 0.08, 1.3]} />
        </mesh>
        {[-1, 1].flatMap((sx) =>
          [-1, 1].map((sz) => (
            <mesh key={`${sx}${sz}`} position={[sx * 0.6, 1.2, sz * 0.6]} material={materials.stand}>
              <boxGeometry args={[0.06, 2.4, 0.06]} />
            </mesh>
          ))
        )}
      </group>
    </group>
  );
}

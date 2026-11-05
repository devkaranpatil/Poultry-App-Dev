import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FrameMaterial, HousingSystem, RoofSheet, ShedEntry, SideWalls } from '@/types/farm';
import { InstancedPart } from './instancing';
import { InstanceSet, addSegment } from './instanceSet';
import { geo } from './sceneGeometry';
import { metrePlane, tunnelFans, useDisposal } from './structureHelpers';
import {
  FOOTBATH,
  LOW_WALL,
  PLINTH,
  PLINTH_APRON,
  anteroom,
  doorSize,
  roofHeightAt,
  type Point2,
  type RenderQuality,
  type ShedLayout,
} from './shedLayout';
import {
  FRAME_LOOK,
  SHEET_LOOK,
  coolingPadTexture,
  createConcreteMaterial,
  createCurtainMaterial,
  createMemberMaterial,
  createMeshMaterial,
  createSheetMaterial,
  createWallMaterial,
  disposeMaterial,
} from './shedMaterials';

/**
 * The shed itself, laid out by shedLayout.ts: the plinth, the frame (posts, trusses or bamboo rafters, purlins),
 * the roof sheets, the walls (low wall, mesh and curtains, or closed walls), the entry, and for a controlled shed
 * the cooling pads and tunnel fans. Group names start with the part they belong to (src/lib/sceneEdit.ts), so a
 * click on any of them selects that part.
 */


/**
 * The outline of an end wall from `bottom` up to the roof line, with a notch for the door when given. Shape
 * geometry UVs are the outline's own coordinates, so they are metres too.
 */
function endWall(layout: ShedLayout, bottom: number, door: { width: number; height: number } | null): THREE.ShapeGeometry {
  const { halfWidth, profile } = layout;
  const outline: Point2[] = [[-halfWidth, bottom]];
  if (door && door.height > bottom + 0.05) {
    const half = door.width / 2;
    outline.push([-half, bottom], [-half, door.height], [half, door.height], [half, bottom]);
  }
  outline.push([halfWidth, bottom], ...[...profile].reverse());
  return new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))));
}

const shapeOf = (layout: ShedLayout) => ({
  length: layout.halfLength * 2,
  width: layout.halfWidth * 2,
  eavesHeight: layout.eavesHeight,
  ridgeHeight: layout.ridgeHeight,
  roofType: layout.roofType,
});

/* ------------------------------------------------------------------------------------------------ floor */

/** The concrete plinth, running 1.5 ft outside the walls. */
export function ShedFloor({ layout }: { layout: ShedLayout }) {
  const material = useMemo(createConcreteMaterial, []);
  const items = useMemo(() => [material], [material]);
  useDisposal(items);
  return (
    <group name="shed-floor">
      <mesh position={[0, PLINTH / 2, 0]} material={material} receiveShadow>
        <boxGeometry args={[layout.halfWidth * 2 + PLINTH_APRON * 2, PLINTH, layout.halfLength * 2 + PLINTH_APRON * 2]} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ frame */

/**
 * Posts at every truss line along both side walls; on each line a truss (steel angle on steel or RCC posts) or,
 * for bamboo, rafters with a tie beam and king post; purlins under the sheets; wall plates along the wall tops;
 * and on steel, cross bracing in the end bays.
 */
export function ShedFrame({ layout, frame }: { layout: ShedLayout; frame: FrameMaterial }) {
  const look = FRAME_LOOK[frame];
  const built = useMemo(() => {
    const posts = new InstanceSet();
    const members = new InstanceSet();
    const { halfWidth: hw, halfLength: hl, frameZ, wallTop, eavesHeight: e, profile, planes, roofZ, monitor, roofType } = layout;
    const shape = shapeOf(layout);
    const postR = look.post.size;
    const r = look.member.size;
    // Purlins sit on the trusses and the sheet on the purlins.
    const purlinR = r * 0.8;
    const under = 2 * purlinR + r;
    const topAt = (x: number) =>
      (monitor && Math.abs(x) < monitor.halfWidth ? roofHeightAt(shape, monitor.halfWidth) : roofHeightAt(shape, x)) - under;

    for (const z of frameZ) {
      addSegment(posts, [-hw, PLINTH, z], [-hw, wallTop.left, z], postR);
      addSegment(posts, [hw, PLINTH, z], [hw, wallTop.right, z], postR);
      // Top chord or rafters just under the purlins (so nothing pokes through the sheet), and the bottom chord or tie
      // beam at the eaves.
      for (let i = 0; i + 1 < profile.length; i += 1) {
        addSegment(members, [profile[i][0], profile[i][1] - under, z], [profile[i + 1][0], profile[i + 1][1] - under, z], r);
      }
      addSegment(members, [-hw, e, z], [hw, e, z], r);
      if (monitor) addSegment(members, [-monitor.halfWidth, topAt(0), z], [monitor.halfWidth, topAt(0), z], r);

      if (look.truss) {
        const width = hw * 2;
        const panels = Math.max(2, 2 * Math.round(width / 2.4));
        const xs = Array.from({ length: panels + 1 }, (_, i) => -hw + (i * width) / panels);
        for (let i = 1; i < panels; i += 1) {
          if (topAt(xs[i]) - e > 0.08) addSegment(members, [xs[i], e, z], [xs[i], topAt(xs[i]), z], r * 0.75);
        }
        for (let i = 0; i < panels; i += 1) {
          const [x0, x1] = [xs[i], xs[i + 1]];
          // Diagonals run up towards the ridge on both halves (all one way on a lean-to).
          const rising = roofType === 'lean-to' || x1 <= 1e-6;
          const a: [number, number, number] = rising ? [x0, e, z] : [x0, topAt(x0), z];
          const b: [number, number, number] = rising ? [x1, topAt(x1), z] : [x1, e, z];
          if (Math.abs(a[1] - b[1]) > 0.08) addSegment(members, a, b, r * 0.7);
        }
      } else if (roofType !== 'lean-to') {
        addSegment(members, [0, e, z], [0, topAt(0), z], r);
      }
    }

    // Purlins about every 0.9 m down each sheet, just under it.
    for (const plane of planes) {
      const [ax, ay] = plane.a;
      const [bx, by] = plane.b;
      const count = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.9) + 1);
      for (let k = 0; k < count; k += 1) {
        const t = k / (count - 1);
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t - purlinR;
        addSegment(members, [x, y, roofZ.min], [x, y, roofZ.max], purlinR);
      }
    }

    // Wall plates: a concrete ring beam on RCC pillars, a member otherwise.
    const plates = frame === 'rcc-pillars' ? posts : members;
    const plateR = frame === 'rcc-pillars' ? postR * 0.9 : r;
    addSegment(plates, [-hw, wallTop.left, -hl], [-hw, wallTop.left, hl], plateR);
    addSegment(plates, [hw, wallTop.right, -hl], [hw, wallTop.right, hl], plateR);

    if (frame === 'steel-truss' && frameZ.length > 1) {
      const ends: Array<[number, number]> = [
        [frameZ[0], frameZ[1]],
        [frameZ[frameZ.length - 2], frameZ[frameZ.length - 1]],
      ];
      const sides: Array<[number, number]> = [
        [-hw, wallTop.left],
        [hw, wallTop.right],
      ];
      for (const [z0, z1] of ends) {
        for (const [x, top] of sides) {
          addSegment(members, [x, LOW_WALL, z0], [x, top, z1], r * 0.5);
          addSegment(members, [x, top, z0], [x, LOW_WALL, z1], r * 0.5);
        }
      }
    }
    return { posts, members };
  }, [layout, look, frame]);

  const materials = useMemo(() => ({ post: createMemberMaterial(look.post), member: createMemberMaterial(look.member) }), [look]);
  const items = useMemo(() => [materials.post, materials.member], [materials]);
  useDisposal(items);
  const shapeFor = (round: boolean) => (round ? geo.cylinderRound() : geo.square());

  return (
    <group name="frame-model" userData={{ frame, bays: layout.bays }}>
      <InstancedPart name="frame-posts" set={built.posts} geometry={shapeFor(look.post.round)} material={materials.post} castShadow />
      <InstancedPart name="frame-members" set={built.members} geometry={shapeFor(look.member.round)} material={materials.member} castShadow />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ roof */

/** The roof sheets over the full length plus the end overhangs, a ridge cap, and on a monitor roof the mesh in the raised opening. */
export function ShedRoof({ layout, sheet, quality }: { layout: ShedLayout; sheet: RoofSheet; quality: RenderQuality }) {
  const look = SHEET_LOOK[sheet];
  const zLength = layout.roofZ.max - layout.roofZ.min;
  const zCentre = (layout.roofZ.max + layout.roofZ.min) / 2;
  const pieces = useMemo(
    () =>
      layout.planes.map(({ a, b }) => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const angle = Math.atan2(dy, dx);
        // The sheet lies on the line: its centre is half its thickness above it.
        const offset = look.thickness / 2;
        return {
          x: (a[0] + b[0]) / 2 - Math.sin(angle) * offset,
          y: (a[1] + b[1]) / 2 + Math.cos(angle) * offset,
          angle,
          slope: Math.hypot(dx, dy),
        };
      }),
    [layout, look.thickness]
  );
  const materials = useMemo(() => pieces.map((piece) => createSheetMaterial(sheet, quality, zLength, piece.slope)), [pieces, sheet, quality, zLength]);
  const extras = useMemo(
    () => ({
      cap: new THREE.MeshStandardMaterial({ color: new THREE.Color(look.color).multiplyScalar(0.85), metalness: look.metalness, roughness: look.roughness }),
      mesh: createMeshMaterial(quality),
      vent: layout.monitor ? metrePlane(zLength, layout.monitor.lift) : null,
    }),
    [look, quality, layout.monitor, zLength]
  );
  const items = useMemo(() => [...materials, extras.cap, extras.mesh, ...(extras.vent ? [extras.vent] : [])], [materials, extras]);
  useDisposal(items);

  const { monitor, halfWidth } = layout;
  const ventBase = monitor ? roofHeightAt(shapeOf(layout), monitor.halfWidth) : 0;

  return (
    <group name="roof-model" userData={{ roof: layout.roofType, sheet }}>
      <group name="roof-sheet">
        {pieces.map((piece, i) => (
          <mesh key={i} position={[piece.x, piece.y, zCentre]} rotation={[0, 0, piece.angle]} material={materials[i]} castShadow receiveShadow>
            <boxGeometry args={[piece.slope, look.thickness, zLength]} />
          </mesh>
        ))}
      </group>
      {layout.roofType !== 'lean-to' ? (
        <mesh name="roof-ridge" position={[0, layout.ridgeHeight + look.thickness + 0.02, zCentre]} material={extras.cap} castShadow>
          <boxGeometry args={[Math.min(0.45, halfWidth), sheet === 'thatch' ? 0.14 : 0.05, zLength]} />
        </mesh>
      ) : null}
      {monitor && extras.vent ? (
        <group name="roof-vent">
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              geometry={extras.vent!}
              material={extras.mesh}
              position={[side * monitor.halfWidth, ventBase + monitor.lift / 2, zCentre]}
              rotation={[0, Math.PI / 2, 0]}
            />
          ))}
        </group>
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ walls */

interface WallsProps {
  layout: ShedLayout;
  sideWalls: SideWalls;
  housing: HousingSystem;
  quality: RenderQuality;
}

/** How much of the open side the curtains cover in the model: let down part way, as on a mild day. */
export const CURTAIN_SHARE = 0.4;

/**
 * Open sheds: a plastered low wall, welded mesh to the roof, and tarpaulin curtains (with a winch and cables when
 * automatic); a backyard shed adds a fenced run. Controlled sheds: closed walls all round. The door end has an
 * opening for the door.
 */
export function ShedWalls({ layout, sideWalls, housing, quality }: WallsProps) {
  const closed = sideWalls === 'closed-tunnel';
  const { halfWidth: hw, halfLength: hl, wallTop, eavesHeight } = layout;
  const length = hl * 2;
  const door = useMemo(() => doorSize(eavesHeight), [eavesHeight]);

  const built = useMemo(() => {
    const bottom = closed ? 0 : LOW_WALL;
    return {
      front: endWall(layout, bottom, door),
      back: endWall(layout, bottom, null),
      left: metrePlane(length, wallTop.left - LOW_WALL),
      right: metrePlane(length, wallTop.right - LOW_WALL),
      curtainLeft: metrePlane(length, (wallTop.left - LOW_WALL) * CURTAIN_SHARE),
      curtainRight: metrePlane(length, (wallTop.right - LOW_WALL) * CURTAIN_SHARE),
    };
  }, [layout, closed, door, length, wallTop.left, wallTop.right]);
  const materials = useMemo(
    () => ({
      wall: createWallMaterial(quality),
      mesh: createMeshMaterial(quality),
      curtain: createCurtainMaterial(),
      steel: new THREE.MeshStandardMaterial({ color: '#6f7a83', metalness: 0.4, roughness: 0.5 }),
    }),
    [quality]
  );
  const items = useMemo(() => [...Object.values(built), ...Object.values(materials)], [built, materials]);
  useDisposal(items);

  const cables = useMemo(() => {
    const set = new InstanceSet();
    if (sideWalls !== 'mesh-auto-curtain') return set;
    const sides: Array<[number, number]> = [
      [-hw - 0.07, wallTop.left],
      [hw + 0.07, wallTop.right],
    ];
    for (const [x, top] of sides) {
      const curtainTop = LOW_WALL + (top - LOW_WALL) * CURTAIN_SHARE;
      for (const z of layout.frameZ) addSegment(set, [x, curtainTop, z], [x, top - 0.05, z], 0.006);
      addSegment(set, [x, top - 0.05, -hl], [x, top - 0.05, hl], 0.006);
    }
    return set;
  }, [sideWalls, hw, hl, wallTop.left, wallTop.right, layout.frameZ]);

  if (closed) {
    return (
      <group name="walls-model" userData={{ sideWalls }}>
        <group name="walls-solid">
          <mesh position={[-hw, wallTop.left / 2, 0]} material={materials.wall} castShadow receiveShadow>
            <boxGeometry args={[0.15, wallTop.left, length]} />
          </mesh>
          <mesh position={[hw, wallTop.right / 2, 0]} material={materials.wall} castShadow receiveShadow>
            <boxGeometry args={[0.15, wallTop.right, length]} />
          </mesh>
          <mesh geometry={built.front} material={materials.wall} position={[0, 0, hl]} castShadow />
          <mesh geometry={built.back} material={materials.wall} position={[0, 0, -hl]} castShadow />
        </group>
      </group>
    );
  }

  const halfDoor = door.width / 2;
  const frontPiece = Math.max(hw - halfDoor, 0);
  const curtainY = (top: number) => LOW_WALL + ((top - LOW_WALL) * CURTAIN_SHARE) / 2;
  const rollY = (top: number) => LOW_WALL + (top - LOW_WALL) * CURTAIN_SHARE;
  const rolls: Array<[number, number]> = [
    [-hw - 0.08, rollY(wallTop.left)],
    [hw + 0.08, rollY(wallTop.right)],
  ];
  return (
    <group name="walls-model" userData={{ sideWalls }}>
      <group name="walls-low">
        <mesh position={[-hw, LOW_WALL / 2, 0]} material={materials.wall} castShadow receiveShadow>
          <boxGeometry args={[0.23, LOW_WALL, length]} />
        </mesh>
        <mesh position={[hw, LOW_WALL / 2, 0]} material={materials.wall} castShadow receiveShadow>
          <boxGeometry args={[0.23, LOW_WALL, length]} />
        </mesh>
        <mesh position={[0, LOW_WALL / 2, -hl]} material={materials.wall} castShadow receiveShadow>
          <boxGeometry args={[hw * 2, LOW_WALL, 0.23]} />
        </mesh>
        {frontPiece > 0.05
          ? [-1, 1].map((side) => (
              <mesh key={side} position={[side * (halfDoor + frontPiece / 2), LOW_WALL / 2, hl]} material={materials.wall} castShadow receiveShadow>
                <boxGeometry args={[frontPiece, LOW_WALL, 0.23]} />
              </mesh>
            ))
          : null}
      </group>
      <group name="walls-mesh">
        <mesh geometry={built.left} material={materials.mesh} position={[-hw, (LOW_WALL + wallTop.left) / 2, 0]} rotation={[0, -Math.PI / 2, 0]} />
        <mesh geometry={built.right} material={materials.mesh} position={[hw, (LOW_WALL + wallTop.right) / 2, 0]} rotation={[0, Math.PI / 2, 0]} />
        <mesh geometry={built.front} material={materials.mesh} position={[0, 0, hl]} />
        <mesh geometry={built.back} material={materials.mesh} position={[0, 0, -hl]} />
      </group>
      <group name="walls-curtains">
        <mesh geometry={built.curtainLeft} material={materials.curtain} position={[-hw - 0.06, curtainY(wallTop.left), 0]} rotation={[0, -Math.PI / 2, 0]} castShadow />
        <mesh geometry={built.curtainRight} material={materials.curtain} position={[hw + 0.06, curtainY(wallTop.right), 0]} rotation={[0, Math.PI / 2, 0]} castShadow />
        {rolls.map(([x, y]) => (
          <mesh key={x} position={[x, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.curtain} castShadow>
            <cylinderGeometry args={[0.055, 0.055, length, 10]} />
          </mesh>
        ))}
      </group>
      {sideWalls === 'mesh-auto-curtain' ? (
        <group name="walls-winch">
          <InstancedPart name="walls-winch-cables" set={cables} geometry={geo.cylinder()} material={materials.steel} />
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (hw + 0.2), 1.1, hl - 0.4]} material={materials.steel} castShadow>
              <boxGeometry args={[0.25, 0.35, 0.3]} />
            </mesh>
          ))}
        </group>
      ) : null}
      {housing === 'backyard' ? <BackyardRun layout={layout} mesh={materials.mesh} post={materials.steel} /> : null}
    </group>
  );
}

/** How far the fenced run of a backyard shed reaches out from the right-hand wall. */
export const RUN_DEPTH = 3;

/** The fenced run beside a backyard shed, where improved desi birds forage by day. */
function BackyardRun({ layout, mesh, post }: { layout: ShedLayout; mesh: THREE.Material; post: THREE.Material }) {
  const height = 1.2;
  const { halfWidth: hw, halfLength: hl } = layout;
  const built = useMemo(() => {
    const posts = new InstanceSet();
    const count = Math.max(2, Math.ceil((hl * 2) / 1.5) + 1);
    for (let i = 0; i < count; i += 1) {
      const z = -hl + (i * hl * 2) / (count - 1);
      addSegment(posts, [hw + RUN_DEPTH, 0, z], [hw + RUN_DEPTH, height, z], 0.03);
    }
    return { posts, side: metrePlane(hl * 2, height), end: metrePlane(RUN_DEPTH, height) };
  }, [hw, hl]);
  const items = useMemo(() => [built.side, built.end], [built]);
  useDisposal(items);
  return (
    <group name="walls-run">
      <InstancedPart name="walls-run-posts" set={built.posts} geometry={geo.cylinderRound()} material={post} />
      <mesh geometry={built.side} material={mesh} position={[hw + RUN_DEPTH, height / 2, 0]} rotation={[0, Math.PI / 2, 0]} />
      <mesh geometry={built.end} material={mesh} position={[hw + RUN_DEPTH / 2, height / 2, -hl]} />
      <mesh geometry={built.end} material={mesh} position={[hw + RUN_DEPTH / 2, height / 2, hl]} />
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ entry */

function Door({ width, height, solid, frame, panel }: { width: number; height: number; solid: boolean; frame: THREE.Material; panel: THREE.Material }) {
  const bar = 0.05;
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[(side * (width - bar)) / 2, height / 2, 0]} material={frame} castShadow>
          <boxGeometry args={[bar, height, bar]} />
        </mesh>
      ))}
      <mesh position={[0, height - bar / 2, 0]} material={frame} castShadow>
        <boxGeometry args={[width, bar, bar]} />
      </mesh>
      <mesh position={[0, height / 2, 0]} material={panel}>
        <boxGeometry args={[width - bar * 2, height - bar, solid ? 0.03 : 0.005]} />
      </mesh>
    </group>
  );
}

/** A concrete tray of disinfectant (potassium permanganate pink) the width of the door. */
function Footbath({ z, concrete, liquid }: { z: number; concrete: THREE.Material; liquid: THREE.Material }) {
  return (
    <group name="entry-footbath" position={[0, 0, z]}>
      <mesh position={[0, 0.06, 0]} material={concrete} receiveShadow>
        <boxGeometry args={[FOOTBATH.width, 0.12, FOOTBATH.depth]} />
      </mesh>
      <mesh position={[0, 0.125, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquid}>
        <planeGeometry args={[FOOTBATH.width - 0.14, FOOTBATH.depth - 0.14]} />
      </mesh>
    </group>
  );
}

/**
 * The door in the front end wall; with a footbath outside it; or an anteroom (a small walled room with its own
 * roof and outer door, the footbath at that door) to change boots and clothes before going in.
 */
export function ShedEntryModel({ layout, entry, closed, quality }: { layout: ShedLayout; entry: ShedEntry; closed: boolean; quality: RenderQuality }) {
  const { halfLength: hl, eavesHeight } = layout;
  const door = doorSize(eavesHeight);
  const room = anteroom(entry, eavesHeight);
  const materials = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ color: '#5f6b73', metalness: 0.4, roughness: 0.5 }),
      mesh: createMeshMaterial(quality),
      solid: new THREE.MeshStandardMaterial({ color: '#8a9399', metalness: 0.35, roughness: 0.5 }),
      wall: createWallMaterial(quality),
      roof: new THREE.MeshStandardMaterial({ color: '#b9c0c6', metalness: 0.45, roughness: 0.45 }),
      concrete: createConcreteMaterial(),
      liquid: new THREE.MeshStandardMaterial({ color: '#a24c8f', roughness: 0.15, transparent: true, opacity: 0.85 }),
    }),
    [quality]
  );
  const items = useMemo(() => Object.values(materials), [materials]);
  useDisposal(items);

  const wallT = 0.12;
  const outerZ = room ? hl + room.depth : hl;
  const solidDoor = closed || Boolean(room);
  return (
    <group name="entry-model" userData={{ entry }}>
      <group name="entry-door" position={[0, 0, hl + 0.02]}>
        <Door width={door.width} height={door.height} solid={solidDoor} frame={materials.frame} panel={solidDoor ? materials.solid : materials.mesh} />
      </group>
      {room ? (
        <group name="entry-anteroom" position={[0, 0, hl]}>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[(side * (room.width - wallT)) / 2, room.height / 2, room.depth / 2]} material={materials.wall} castShadow receiveShadow>
              <boxGeometry args={[wallT, room.height, room.depth]} />
            </mesh>
          ))}
          {/* The front wall either side of and above the outer door. */}
          {[-1, 1].map((side) => {
            const piece = (room.width - door.width) / 2;
            return (
              <mesh key={`front${side}`} position={[side * (door.width / 2 + piece / 2), room.height / 2, room.depth - wallT / 2]} material={materials.wall} castShadow>
                <boxGeometry args={[piece, room.height, wallT]} />
              </mesh>
            );
          })}
          <mesh position={[0, (door.height + room.height) / 2, room.depth - wallT / 2]} material={materials.wall}>
            <boxGeometry args={[door.width, Math.max(room.height - door.height, 0.01), wallT]} />
          </mesh>
          <mesh position={[0, room.height + 0.03, room.depth / 2]} rotation={[0.08, 0, 0]} material={materials.roof} castShadow>
            <boxGeometry args={[room.width + 0.3, 0.02, room.depth + 0.3]} />
          </mesh>
          <group position={[0, 0, room.depth + 0.02]}>
            <Door width={door.width} height={door.height} solid frame={materials.frame} panel={materials.solid} />
          </group>
        </group>
      ) : null}
      {entry !== 'single-door' ? <Footbath z={outerZ + FOOTBATH.depth / 2 + 0.05} concrete={materials.concrete} liquid={materials.liquid} /> : null}
    </group>
  );
}

/* ------------------------------------------------------------------------------------------------ tunnel */

/** Fan rotor of radius 1 facing +z: a hub and pitched blades. */
function fanRotor(blades: number): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12).rotateX(Math.PI / 2)];
  for (let k = 0; k < blades; k += 1) {
    const blade = new THREE.BoxGeometry(0.34, 0.86, 0.02).translate(0, 0.52, 0).rotateY(0.35);
    blade.rotateZ((k / blades) * Math.PI * 2);
    pieces.push(blade);
  }
  const flat = pieces.map((piece) => (piece.index ? piece.toNonIndexed() : piece));
  const merged = mergeGeometries(flat, false)!;
  pieces.forEach((piece) => piece.dispose());
  flat.forEach((piece) => piece.dispose());
  return merged;
}


/**
 * Tunnel ventilation: wet cellulose pads on both side walls at the entry end draw air in, and the fans in the back
 * end wall pull it the length of the shed. A diesel generator stands by for power cuts.
 */
export function TunnelEquipment({ layout, quality, animate }: { layout: ShedLayout; quality: RenderQuality; animate: boolean }) {
  const { halfWidth: hw, halfLength: hl, eavesHeight } = layout;
  const padLength = Math.max(Math.min(Math.max(hl * 2 * 0.25, 1.5), 9, hl * 2 - 1.2), 0.5);
  const padTop = Math.min(eavesHeight - 0.25, 2.0);
  const padHeight = Math.max(padTop - LOW_WALL, 0.4);
  const padZ = hl - 0.6 - padLength / 2;
  const fans = tunnelFans(layout);
  const rotors = useRef<THREE.Mesh[]>([]);

  const built = useMemo(() => ({ pad: metrePlane(padLength, padHeight), rotor: fanRotor(quality === 'lite' ? 3 : 5) }), [padLength, padHeight, quality]);
  const materials = useMemo(() => {
    const texture = quality === 'lite' ? null : coolingPadTexture();
    if (texture) texture.repeat.set(4, 4);
    return {
      pad: new THREE.MeshStandardMaterial({ color: texture ? '#ffffff' : '#a8743c', roughness: 0.95, map: texture, side: THREE.DoubleSide }),
      housing: new THREE.MeshStandardMaterial({ color: '#c5cbd0', metalness: 0.45, roughness: 0.4 }),
      blade: new THREE.MeshStandardMaterial({ color: '#d7dde1', metalness: 0.5, roughness: 0.35 }),
      grill: createMeshMaterial(quality),
      pipe: new THREE.MeshStandardMaterial({ color: '#3b6ea8', roughness: 0.5 }),
      generator: new THREE.MeshStandardMaterial({ color: '#2f6b3f', roughness: 0.6, metalness: 0.2 }),
    };
  }, [quality]);
  const items = useMemo(() => [built.pad, built.rotor, ...Object.values(materials)], [built, materials]);
  useDisposal(items);

  useFrame((_, delta) => {
    if (!animate) return;
    for (const rotor of rotors.current) if (rotor) rotor.rotation.z += Math.min(delta, 0.1) * 9;
  });

  return (
    <group name="tunnel-equipment" userData={{ fans: fans.xs.length }}>
      <group name="tunnel-pads">
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh geometry={built.pad} material={materials.pad} position={[side * (hw + 0.1), LOW_WALL + padHeight / 2, padZ]} rotation={[0, (side * Math.PI) / 2, 0]} />
            <mesh position={[side * (hw + 0.12), padTop + 0.06, padZ]} rotation={[Math.PI / 2, 0, 0]} material={materials.pipe}>
              <cylinderGeometry args={[0.03, 0.03, padLength, 8]} />
            </mesh>
            <mesh position={[side * (hw + 0.14), LOW_WALL - 0.06, padZ]} material={materials.housing}>
              <boxGeometry args={[0.16, 0.08, padLength]} />
            </mesh>
          </group>
        ))}
      </group>
      <group name="tunnel-fans" position={[0, 0, -hl - 0.12]}>
        {fans.xs.map((x, i) => (
          <group key={x} position={[x, fans.y, 0]}>
            <mesh material={materials.housing} castShadow>
              <boxGeometry args={[fans.size, fans.size, 0.4]} />
            </mesh>
            <mesh
              ref={(mesh) => {
                if (mesh) rotors.current[i] = mesh;
              }}
              geometry={built.rotor}
              material={materials.blade}
              position={[0, 0, -0.22]}
              scale={fans.size * 0.44}
            />
            <mesh material={materials.grill} position={[0, 0, -0.26]}>
              <planeGeometry args={[fans.size * 0.94, fans.size * 0.94]} />
            </mesh>
          </group>
        ))}
      </group>
      <group name="tunnel-generator" position={[-hw - 2.2, 0, -hl + 1.2]}>
        <mesh position={[0, 0.5, 0]} material={materials.generator} castShadow>
          <boxGeometry args={[1.0, 1.0, 1.6]} />
        </mesh>
      </group>
    </group>
  );
}

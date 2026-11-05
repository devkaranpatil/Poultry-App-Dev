import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerModelSnapshot } from '@/lib/modelSnapshot';
import type { ScreenPoint } from '@/lib/modalTransform';

/** What a G or S transform needs from the view: the house centre on screen, and metres per pixel there. */
export interface ModalProjector {
  centre: (height: number) => ScreenPoint;
  metresPerPixel: () => number;
}

export function ModalProjectorRegistrar({ projector }: { projector: { current: ModalProjector | null } }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    projector.current = {
      centre: (height) => {
        camera.updateMatrixWorld();
        const point = new THREE.Vector3(0, height / 2, 0).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
      },
      metresPerPixel: () => {
        const rect = gl.domElement.getBoundingClientRect();
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
        const distance = camera.position.length();
        return (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov) / 2)) / Math.max(rect.height, 1);
      },
    };
    return () => {
      projector.current = null;
    };
  }, [camera, gl, projector]);
  return null;
}

/** Exposes a capture of the current view to the report exporters. */
export function SnapshotRegistrar() {
  const { gl, scene, camera } = useThree();
  useEffect(
    () =>
      registerModelSnapshot(() => {
        // Render synchronously so the buffer holds a frame even without preserveDrawingBuffer.
        gl.render(scene, camera);
        return gl.domElement.toDataURL('image/jpeg', 0.9);
      }),
    [gl, scene, camera]
  );
  return null;
}

/**
 * With frameloop="demand", asks for a frame a few times a second so the ambient animations keep
 * moving. Used on software WebGL, where rendering at the display rate blocks the page's input.
 */
export function FrameRateCap({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const timer = window.setInterval(() => invalidate(), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [invalidate, fps]);
  return null;
}

/** Test hook: where a named object appears on screen, so a browser test can click or drag it. Not in production builds. */
export function ProjectionTestHook() {
  const { camera, gl, scene } = useThree();
  useEffect(() => {
    if (import.meta.env.PROD) return undefined;
    const target = window as unknown as { __farmProject?: (name: string, centre?: boolean) => { x: number; y: number } | null };
    // `centre` aims at the middle of the object's bounds; part groups such as doors sit at the house origin.
    target.__farmProject = (name: string, centre = false) => {
      const object = scene.getObjectByName(name);
      if (!object) return null;
      camera.updateMatrixWorld();
      const world = centre ? new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()) : object.getWorldPosition(new THREE.Vector3());
      const point = world.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    };
    return () => {
      delete target.__farmProject;
    };
  }, [camera, gl, scene]);
  return null;
}

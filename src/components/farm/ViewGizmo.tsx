import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useI18n } from '@/context/I18nContext';
import { GIZMO_AXES, projectAxes, type GizmoAxis, type Vec3 } from '@/lib/viewMath';
import type { OrientationChannel } from '@/lib/orientationChannel';

/** Inside the canvas: publishes the camera's view rotation after every rendered frame. */
export function OrientationReporter({ channel }: { channel: OrientationChannel }) {
  const camera = useThree((state) => state.camera);
  useFrame(() => {
    camera.updateMatrixWorld();
    channel.publish(camera.matrixWorldInverse.elements);
  });
  return null;
}

const AXIS_STYLE: Record<'x' | 'y' | 'z', { color: string; label: string }> = {
  x: { color: '#ef4444', label: 'X' },
  y: { color: '#22c55e', label: 'Y' },
  z: { color: '#3b82f6', label: 'Z' },
};

const RADIUS = 34;
const HALF = 46;

/**
 * Blender's navigation gizmo: the world axes as seen from the camera. Clicking an axis ball looks
 * down that axis; the balls are real buttons, so the gizmo also works from the keyboard.
 */
export function ViewGizmo({ channel, onAxis }: { channel: OrientationChannel; onAxis: (direction: Vec3, axis: GizmoAxis) => void }) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(
    () =>
      channel.subscribe((rotation) => {
        const svg = svgRef.current;
        if (!svg) return;
        for (const { axis, x, y, depth } of projectAxes(rotation)) {
          const node = svg.querySelector<SVGGElement>(`[data-axis="${axis}"]`);
          const line = svg.querySelector<SVGLineElement>(`[data-line="${axis}"]`);
          const px = HALF + x * RADIUS;
          const py = HALF - y * RADIUS;
          if (node) {
            node.setAttribute('transform', `translate(${px.toFixed(2)} ${py.toFixed(2)})`);
            node.style.opacity = String(0.55 + 0.45 * ((depth + 1) / 2));
            node.parentNode?.appendChild(node); // back to front: the nearest axis ends up on top
          }
          if (line) {
            line.setAttribute('x2', px.toFixed(2));
            line.setAttribute('y2', py.toFixed(2));
          }
        }
      }),
    [channel]
  );

  const viewNames: Record<GizmoAxis, string> = {
    x: t('viewport.axis.side'),
    '-x': t('viewport.axis.otherSide'),
    y: t('viewport.axis.top'),
    '-y': t('viewport.axis.top'),
    z: t('viewport.axis.front'),
    '-z': t('viewport.axis.back'),
  };

  return (
    <div className="pointer-events-auto rounded-full bg-card/55 shadow-soft backdrop-blur-sm transition-colors hover:bg-card/80" data-testid="view-gizmo">
      <svg ref={svgRef} width={HALF * 2} height={HALF * 2} viewBox={`0 0 ${HALF * 2} ${HALF * 2}`} role="group" aria-label={t('viewport.gizmo')}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <line key={axis} data-line={axis} x1={HALF} y1={HALF} x2={HALF} y2={HALF} stroke={AXIS_STYLE[axis].color} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        <g>
          {GIZMO_AXES.map(({ axis, direction }) => {
            const base = axis.replace('-', '') as 'x' | 'y' | 'z';
            const negative = axis.startsWith('-');
            const style = AXIS_STYLE[base];
            // Looking up from below the ground is never useful; the -Y ball also shows the top view.
            const target: Vec3 = axis === '-y' ? [0, 1, 0] : direction;
            return (
              <g
                key={axis}
                data-axis={axis}
                role="button"
                tabIndex={0}
                aria-label={viewNames[axis]}
                className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-foreground"
                transform={`translate(${HALF} ${HALF})`}
                onClick={() => onAxis(target, axis)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onAxis(target, axis);
                  }
                }}
              >
                <title>{viewNames[axis]}</title>
                <circle
                  r={negative ? 7 : 9.5}
                  fill={negative ? 'hsl(var(--card))' : style.color}
                  stroke={style.color}
                  strokeWidth={negative ? 2 : 1.5}
                  className="transition-[r] hover:[r:11]"
                />
                {negative ? null : (
                  <text textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={700} fill="#fff" pointerEvents="none">
                    {style.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

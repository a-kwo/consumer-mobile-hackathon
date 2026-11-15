import { Canvas, Circle, Points, RadialGradient } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { colors } from '@/theme';

import { LAND_VECTORS, dotSize, type GlobeCamera, type GlobeFrame } from './globe';
import { projectVector } from './globe-math';

export type GlobeCanvasProps = {
  frame: GlobeFrame;
  camera: GlobeCamera;
};

/** Dots this close to the edge of the disc are dropped: they would be slivers. */
const LIMB = 0.04;

/**
 * The globe itself, on native: a paper sphere with the land as ink grains,
 * drawn with Skia. The grains on the near side are re-projected on the UI
 * thread whenever the camera moves, and handed to one `Points` node. Takes no
 * touches.
 *
 * `globe-canvas.web.tsx` draws the same thing on an HTML canvas.
 */
export function GlobeCanvas({ frame, camera }: GlobeCanvasProps) {
  const { width, height, radius } = frame;
  const cx = width / 2;
  const cy = height / 2;
  // Held in a shared value so the UI thread has its own copy, made once.
  const land = useSharedValue(LAND_VECTORS);

  const points = useDerivedValue(() => {
    const vectors = land.get();
    const lat = camera.lat.get();
    const lon = camera.lon.get();
    const r = radius * camera.zoom.get();
    const centreY = cy + camera.shiftY.get();
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < vectors.length; i += 3) {
      const p = projectVector(vectors[i], vectors[i + 1], vectors[i + 2], lat, lon);
      if (p.z <= LIMB) continue;
      const x = cx + p.x * r;
      const y = centreY - p.y * r;
      // Zoomed in, most of the near side is outside the frame.
      if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
      out.push({ x, y });
    }
    return out;
  });
  const centre = useDerivedValue(() => ({ x: cx, y: cy + camera.shiftY.get() }));
  const r = useDerivedValue(() => radius * camera.zoom.get());
  const grain = useDerivedValue(() => dotSize(radius, camera.zoom.get()));

  return (
    <Canvas style={{ width, height, pointerEvents: 'none' }}>
      {/* The sphere: lit from the front, falling away to the edge. */}
      <Circle c={centre} r={r}>
        <RadialGradient
          c={centre}
          colors={[colors.paperRaised, colors.paperRaised, colors.paperSunk]}
          positions={[0, 0.62, 1]}
          r={r}
        />
      </Circle>
      <Points
        color={colors.inkMuted}
        mode="points"
        opacity={0.62}
        points={points}
        strokeCap="round"
        strokeWidth={grain}
        style="stroke"
      />
      {/* The edge fades the outermost grains, so the globe reads as round. */}
      <Circle c={centre} r={r}>
        <RadialGradient
          c={centre}
          colors={['rgba(234, 225, 210, 0)', 'rgba(234, 225, 210, 0)', 'rgba(234, 225, 210, 0.85)']}
          positions={[0, 0.8, 1]}
          r={r}
        />
      </Circle>
      <Circle c={centre} color={colors.hairline} r={r} strokeWidth={1} style="stroke" />
    </Canvas>
  );
}

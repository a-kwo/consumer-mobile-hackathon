import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { colors } from '@/theme';

import { LAND_VECTORS, dotSize, type GlobeCamera, type GlobeFrame } from './globe';
import { projectVector } from './globe-math';

export type GlobeCanvasProps = {
  frame: GlobeFrame;
  camera: GlobeCamera;
};

const LIMB = 0.04;
const CANVAS_STYLE = { width: '100%', height: '100%', display: 'block' } as const;

/**
 * Frame timing of the globe on the web, for measuring: how many frames were
 * drawn and how long the last draw took. Read it from the browser console as
 * `__scoreGlobe`.
 */
type GlobeStats = { frames: number; lastDrawMs: number };
const stats: GlobeStats = { frames: 0, lastDrawMs: 0 };
(globalThis as { __scoreGlobe?: GlobeStats }).__scoreGlobe = stats;

/**
 * The globe itself, on the web: the same paper sphere and ink grains as the
 * native Skia canvas, drawn with the 2D canvas API. A frame loop watches the
 * camera and redraws only when it has moved. Takes no touches.
 */
export function GlobeCanvas({ frame, camera }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { width, height, radius } = frame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = width / 2;
    const cy = height / 2;
    let raf = 0;
    let drawn = '';

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const lat = camera.lat.get();
      const lon = camera.lon.get();
      const zoom = camera.zoom.get();
      const shiftY = camera.shiftY.get();
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const key = `${lat}|${lon}|${zoom}|${shiftY}|${ratio}`;
      if (key === drawn) return;
      drawn = key;

      const started = performance.now();
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const r = radius * zoom;
      const centreY = cy + shiftY;

      // The sphere: lit from the front, falling away to the edge.
      const body = ctx.createRadialGradient(cx, centreY, 0, cx, centreY, r);
      body.addColorStop(0, colors.paperRaised);
      body.addColorStop(0.62, colors.paperRaised);
      body.addColorStop(1, colors.paperSunk);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, centreY, r, 0, Math.PI * 2);
      ctx.fill();

      // The land on the near side, as one path of round grains.
      const half = dotSize(radius, zoom) / 2;
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = colors.inkMuted;
      ctx.beginPath();
      for (let i = 0; i < LAND_VECTORS.length; i += 3) {
        const p = projectVector(LAND_VECTORS[i], LAND_VECTORS[i + 1], LAND_VECTORS[i + 2], lat, lon);
        if (p.z <= LIMB) continue;
        const x = cx + p.x * r;
        const y = centreY - p.y * r;
        if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
        ctx.moveTo(x + half, y);
        ctx.arc(x, y, half, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      // The edge fades the outermost grains, so the globe reads as round.
      const edge = ctx.createRadialGradient(cx, centreY, 0, cx, centreY, r);
      edge.addColorStop(0, 'rgba(234, 225, 210, 0)');
      edge.addColorStop(0.8, 'rgba(234, 225, 210, 0)');
      edge.addColorStop(1, 'rgba(234, 225, 210, 0.85)');
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.arc(cx, centreY, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.hairline;
      ctx.lineWidth = 1;
      ctx.stroke();

      stats.frames += 1;
      stats.lastDrawMs = performance.now() - started;
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [width, height, radius, camera]);

  return (
    <View style={{ width, height, pointerEvents: 'none' }}>
      <canvas aria-hidden ref={canvasRef} style={CANVAS_STYLE} />
    </View>
  );
}

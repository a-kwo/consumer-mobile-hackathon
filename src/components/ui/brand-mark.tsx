import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

export type BrandMarkProps = {
  /** Width and height in points. @default 28 */
  size?: number;
  /** Colour of the grains. @default colors.ink */
  color?: string;
  /** @deprecated Ignored. The mark is one colour. */
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The nodal lines of the app's cymatic formula, with six lobes, sampled along
 * rays from the centre: where a line crosses a ray, there is a grain. This is
 * the inner part of the figure on the app icon (see .tmp/brand/render2.js).
 */
function grains(): readonly (readonly [number, number])[] {
  const LOBES = 6;
  const K = (2 * Math.PI) / 17;
  const R_MIN = 14;
  const R_MAX = 31;
  const RAYS = 60;
  const STEP = 0.25;
  const f = (r: number, t: number) =>
    Math.cos(LOBES * t) * Math.sin(K * r) + 0.6 * Math.sin(1.5 * K * r + 1);

  const points: [number, number][] = [];
  for (let ray = 0; ray < RAYS; ray++) {
    const t = (ray / RAYS) * 2 * Math.PI;
    let previous = f(R_MIN, t);
    for (let r = R_MIN + STEP; r <= R_MAX; r += STEP) {
      const current = f(r, t);
      if (previous * current < 0) {
        const crossing =
          r - STEP + (STEP * Math.abs(previous)) / (Math.abs(previous) + Math.abs(current));
        points.push([crossing * Math.cos(t), crossing * Math.sin(t)]);
      }
      previous = current;
    }
  }
  return points;
}

const GRAINS = grains();
const DOT = 1.5;
/** Half the width of the view box: the outermost grain plus its radius. */
const EXTENT = 31 + DOT;

/**
 * Score's mark: a small cymatic figure in ink, the pattern grains make on a
 * vibrating plate. Still, one colour. Use it beside the wordmark and where
 * the app signs its work, such as the share card.
 *
 *   <BrandMark size={24} />
 */
export function BrandMark({ size = 28, color = colors.ink, style }: BrandMarkProps) {
  return (
    <Svg
      accessibilityLabel="Rubato"
      accessibilityRole="image"
      height={size}
      style={style}
      viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
      width={size}>
      {GRAINS.map(([x, y], index) => (
        <Circle cx={x} cy={y} fill={color} key={index} r={DOT} />
      ))}
    </Svg>
  );
}

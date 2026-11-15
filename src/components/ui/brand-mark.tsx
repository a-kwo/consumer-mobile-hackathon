import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { colors } from '@/theme';

export type BrandMarkProps = {
  /** Width and height in points. @default 32 */
  size?: number;
  /** Colour of the rings and the four outer bars. @default colors.text */
  color?: string;
  /** Colour of the centre bar, the downbeat. @default colors.accent */
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

/** The same geometry as the app icon, in a 100 by 100 box. */
const BARS = [
  { x: 30, height: 18, accent: false },
  { x: 40, height: 34, accent: false },
  { x: 50, height: 50, accent: true },
  { x: 60, height: 30, accent: false },
  { x: 70, height: 16, accent: false },
] as const;
const BAR_WIDTH = 5.6;

/**
 * Score's mark: the double ring of a film countdown leader around a waveform
 * whose downbeat is amber. Use it where the app signs its work, such as the
 * share card.
 *
 *   <BrandMark size={28} />
 */
export function BrandMark({
  size = 32,
  color = colors.text,
  accentColor = colors.accent,
  style,
}: BrandMarkProps) {
  return (
    <Svg
      accessibilityLabel="Score"
      accessibilityRole="image"
      height={size}
      style={style}
      viewBox="0 0 100 100"
      width={size}>
      <Circle
        cx={50}
        cy={50}
        fill="none"
        r={41}
        stroke={color}
        strokeOpacity={0.92}
        strokeWidth={2.4}
      />
      <Circle
        cx={50}
        cy={50}
        fill="none"
        r={34.5}
        stroke={color}
        strokeOpacity={0.3}
        strokeWidth={0.7}
      />
      {BARS.map((bar) => (
        <Rect
          fill={bar.accent ? accentColor : color}
          height={bar.height}
          key={bar.x}
          rx={BAR_WIDTH / 2}
          width={BAR_WIDTH}
          x={bar.x - BAR_WIDTH / 2}
          y={50 - bar.height / 2}
        />
      ))}
    </Svg>
  );
}

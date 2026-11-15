import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, motion, radius, shadows } from '@/theme';

import { CoverArt } from './cover-art';
import { coverUrlAtSize } from './cover-url';

export type CoverMosaicProps = {
  /** Up to four cover URLs, in order. Extra entries are ignored; empty ones are skipped. */
  uris: readonly (string | null | undefined)[];
  /** Edge length in points. */
  size: number;
  /** Corner radius. Defaults to 4 up to 64 pt and 6 above. */
  radius?: number;
  /** Draw the soft shadow. @default false */
  shadow?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const GAP = 1.5;

/**
 * A soundtrack's cover: up to four covers in one rounded square.
 *
 * - four covers: a 2 by 2 grid
 * - three: one tall cover on the left, two stacked on the right
 * - two: side by side
 * - one: that cover
 * - none: the `CoverArt` placeholder
 *
 *   <CoverMosaic uris={ost.entries.map((entry) => entry.coverUrl)} size={72} />
 */
export function CoverMosaic({
  uris,
  size,
  radius: radiusProp,
  shadow = false,
  accessibilityLabel,
  style,
}: CoverMosaicProps) {
  const covers = uris.filter((uri): uri is string => !!uri).slice(0, 4);
  const corner = radiusProp ?? (size <= 64 ? radius.thumb : radius.cover);

  if (covers.length <= 1) {
    return (
      <CoverArt
        accessibilityLabel={accessibilityLabel}
        radius={corner}
        shadow={shadow}
        size={size}
        style={style}
        uri={covers[0]}
      />
    );
  }

  const tileSize = size / 2;
  const tile = (uri: string, key: string) => (
    <Image
      accessible={false}
      cachePolicy="memory-disk"
      contentFit="cover"
      key={key}
      source={coverUrlAtSize(uri, covers.length === 2 ? size : tileSize)}
      style={styles.tile}
      transition={motion.duration.base}
    />
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={!!accessibilityLabel}
      style={[
        { width: size, height: size, borderRadius: corner },
        shadow ? shadows.cover : null,
        style,
      ]}>
      <View style={[styles.clip, { borderRadius: corner }]}>
        <View style={styles.column}>
          {tile(covers[0], 'a')}
          {covers.length === 4 ? tile(covers[2], 'c') : null}
        </View>
        <View style={styles.column}>
          {tile(covers[1], 'b')}
          {covers.length >= 3 ? tile(covers[covers.length - 1], 'd') : null}
        </View>
        <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: corner }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    flex: 1,
    flexDirection: 'row',
    gap: GAP,
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.paperRaised,
  },
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43, 36, 32, 0.14)',
  },
});

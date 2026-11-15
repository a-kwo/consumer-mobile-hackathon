import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, motion, radius, shadows } from '@/theme';

import { coverUrlAtSize } from './cover-url';
import { Icon } from './icon';

export type CoverArtProps = {
  /** Cover image URL. `null` or a failed load shows the placeholder. */
  uri?: string | null;
  /** Edge length in points. Omit to fill the parent's width as a square. */
  size?: number;
  /** Corner radius. Defaults to 4 for thumbnails (up to 64 pt) and 6 for anything larger. */
  radius?: number;
  /**
   * Draw the cover's two-layer warm shadow. Defaults to true for a large
   * cover (96 pt and up, or fluid) and false for a thumbnail.
   */
  shadow?: boolean;
  /**
   * Crossfade in milliseconds when `uri` changes. Use `motion.duration.ambient`
   * on the Now screen to match the audio crossfade. @default 420
   */
  transitionMs?: number;
  /** Set to the item's id inside recycling lists so a recycled row never flashes the old cover. */
  recyclingKey?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** @deprecated Ignored. The cover no longer pulses; motion belongs to the cymatic figure. */
  bpm?: number | null;
  /** @deprecated Ignored. */
  pulsing?: boolean;
  /** @deprecated Ignored. The identity has no glows. */
  glowColor?: string;
};

/**
 * Album cover. On Now it is the hero: 272 square, radius 6, with a long soft
 * shadow and a tight contact shadow. In lists it is a 48 pt thumbnail, radius
 * 4, no shadow. With nothing to show it is a paperRaised placeholder.
 *
 *   <CoverArt uri={track.coverUrl} size={sizes.cover} />     // Now
 *   <CoverArt uri={play.coverUrl} size={sizes.thumb} />       // list row
 */
export function CoverArt({
  uri,
  size,
  radius: radiusProp,
  shadow,
  transitionMs = motion.duration.slow,
  recyclingKey,
  accessibilityLabel,
  style,
}: CoverArtProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const thumbnail = size !== undefined && size <= 64;
  const corner = radiusProp ?? (thumbnail ? radius.thumb : radius.cover);
  const lifted = shadow ?? (size === undefined || size >= 96);
  const source = uri && uri !== failedUri ? coverUrlAtSize(uri, size ?? 360) : null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={!!accessibilityLabel}
      style={[
        size ? { width: size, height: size } : styles.fluid,
        { borderRadius: corner },
        lifted ? shadows.cover : null,
        style,
      ]}>
      <View style={[styles.clip, { borderRadius: corner }]}>
        {/* The placeholder sits underneath, so a loading cover fades in over it. */}
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="musical-notes" size={size ? Math.max(14, size * 0.3) : 64} tone="disabled" />
        </View>
        {source ? (
          <Image
            accessible={false}
            cachePolicy="memory-disk"
            contentFit="cover"
            onError={() => setFailedUri(uri ?? null)}
            recyclingKey={recyclingKey}
            source={source}
            style={StyleSheet.absoluteFill}
            transition={{ duration: transitionMs, effect: 'cross-dissolve' }}
          />
        ) : null}
        {/* A faint ink edge, so a cream or white cover keeps its shape on paper. */}
        <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: corner }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fluid: {
    width: '100%',
    aspectRatio: 1,
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.paperRaised,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  edge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43, 36, 32, 0.14)',
  },
});

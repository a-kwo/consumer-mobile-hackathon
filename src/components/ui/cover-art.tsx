import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { beatDurationMs, colors, layout, motion, radius, shadows } from '@/theme';

import { coverUrlAtSize } from './cover-url';
import { Icon } from './icon';

export type CoverArtProps = {
  /** Cover image URL. `null` or a failed load shows the placeholder. */
  uri?: string | null;
  /** Edge length in points. Omit to fill the parent's width as a square. */
  size?: number;
  /** Corner radius. Defaults to a radius in proportion to `size`. */
  radius?: number;
  /**
   * Tempo of the song. When set (and `pulsing` is not false) the cover
   * breathes once per beat. Fast songs pulse in half time so it stays gentle.
   */
  bpm?: number | null;
  /** Gate for the pulse: pass the playing state. @default true */
  pulsing?: boolean;
  /** Draw the deep soft shadow. Turn off for small thumbnails in lists. @default true */
  shadow?: boolean;
  /** Add a coloured halo, for example `colors.accent` while live. */
  glowColor?: string;
  /**
   * Crossfade in milliseconds when `uri` changes. Use `motion.duration.ambient`
   * on the Now screen to match the audio crossfade. @default 420
   */
  transitionMs?: number;
  /** Set to the item's id inside recycling lists so a recycled row never flashes the old cover. */
  recyclingKey?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const pulse = css.keyframes({
  '0%': { transform: [{ scale: 1 }] },
  '16%': { transform: [{ scale: motion.pulseScale }] },
  '100%': { transform: [{ scale: 1 }] },
});

/**
 * Album cover: rounded, with a soft shadow, a hairline edge so dark covers
 * hold their shape on the dark background, an optional pulse at the song's
 * tempo and a placeholder when there is nothing to show.
 *
 *   <CoverArt uri={track.coverUrl} bpm={track.bpm} pulsing={isPlaying} />   // hero, fills width
 *   <CoverArt uri={play.coverUrl} size={52} shadow={false} />               // list thumbnail
 */
export function CoverArt({
  uri,
  size,
  radius: radiusProp,
  bpm,
  pulsing = true,
  shadow = true,
  glowColor,
  transitionMs = motion.duration.slow,
  recyclingKey,
  accessibilityLabel,
  style,
}: CoverArtProps) {
  const reduceMotion = useReducedMotion();
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const corner =
    radiusProp ?? (size ? Math.min(radius.lg, Math.max(radius.xs, size * 0.065)) : radius.lg);
  const source = uri && uri !== failedUri ? coverUrlAtSize(uri, size ?? 360) : null;
  const beatMs = bpm && bpm > 0 && pulsing && !reduceMotion ? beatDurationMs(bpm) : null;

  const boxShadow = [
    ...(shadow ? shadows.cover.boxShadow : []),
    ...(glowColor
      ? [{ offsetX: 0, offsetY: 0, blurRadius: 40, spreadDistance: 0, color: glowColor }]
      : []),
  ];

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={!!accessibilityLabel}
      style={[
        size ? { width: size, height: size } : styles.fluid,
        { borderRadius: corner },
        boxShadow.length > 0 ? { boxShadow } : null,
        beatMs !== null
          ? {
              animationName: pulse,
              animationDuration: beatMs,
              animationIterationCount: 'infinite',
              animationTimingFunction: motion.easing.out,
            }
          : null,
        style,
      ]}>
      <View style={[styles.clip, { borderRadius: corner }]}>
        {/* The placeholder sits underneath, so a loading cover fades in over it. */}
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.13)', 'rgba(255, 255, 255, 0.03)']}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="musical-notes" size={size ? Math.max(14, size * 0.34) : 72} tone="disabled" />
        </LinearGradient>
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
        <View style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: corner }]} />
      </View>
    </Animated.View>
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
    backgroundColor: colors.bgRaised,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  edge: {
    borderWidth: layout.hairline,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
});

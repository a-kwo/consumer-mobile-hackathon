import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  Image as TiledImage,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { colors, ink, motion } from '@/theme';

import { coverUrlAtSize } from './cover-url';

export type AmbientBackgroundProps = {
  /**
   * Cover art of the cue that is playing. The wash crossfades over about two
   * seconds whenever this changes, and fades back to the quiet default
   * gradient when it becomes `null` or `undefined`.
   */
  coverUrl?: string | null;
  /** How far the wash is darkened, 0 (raw colour) to 1 (black). @default 0.52 */
  dim?: number;
  /** Overlay a fine film grain, which also hides banding in the dark gradients. @default true */
  grain?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The wash is drawn from a small bitmap in a small view, then scaled up to
 * fill the screen. A blur radius is measured in bitmap pixels (and capped at
 * 25 on Android), so blurring a small image is what makes the result a wash
 * of colour instead of a soft-focus photo. It also keeps the blur cheap.
 */
const WASH_VIEW = 96;
const WASH_SOURCE_POINTS = 80;
/** Assumed size until the first layout pass reports the real one. */
const FALLBACK_BOX = { width: 430, height: 932 };
/** iOS halves the radius and Android downsamples by four first, so equal looks need unequal values. */
const WASH_BLUR = Platform.select({ ios: 50, android: 10, default: 10 });

const fade = {
  transitionProperty: 'opacity' as const,
  transitionDuration: motion.duration.ambient,
  transitionTimingFunction: motion.easing.standard,
};

/**
 * The backdrop of every screen: near-black, lit by the current song.
 *
 * It fills its parent absolutely and never takes touches. `Screen` renders it
 * for you; use it directly only for a surface that is not a `Screen`, such as
 * the share card or a modal.
 *
 *   <AmbientBackground coverUrl={track?.coverUrl} />
 */
export function AmbientBackground({
  coverUrl,
  dim = 0.52,
  grain = true,
  style,
}: AmbientBackgroundProps) {
  // Measured, not read from the window: the background may fill a card or a
  // sheet rather than the screen.
  const [box, setBox] = useState(FALLBACK_BOX);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== box.width || height !== box.height)) {
      setBox({ width, height });
    }
  };

  // Keep drawing the last cover while the layer fades out, so removing the
  // cover dissolves to the default gradient instead of cutting to it.
  const [lastUrl, setLastUrl] = useState<string | null>(coverUrl ?? null);
  if (coverUrl && coverUrl !== lastUrl) setLastUrl(coverUrl);

  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showCover = !!coverUrl && coverUrl !== failedUrl;
  const source = coverUrlAtSize(lastUrl, WASH_SOURCE_POINTS);

  return (
    <View onLayout={onLayout} style={[StyleSheet.absoluteFill, styles.root, style]}>
      {/* The quiet default: a trace of projector warmth falling into ink. */}
      <LinearGradient
        colors={['#17131C', '#1C1620', '#100F15', colors.bg]}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.haze]} />

      <Animated.View
        style={[StyleSheet.absoluteFill, styles.wash, { opacity: showCover ? 1 : 0 }, fade]}>
        <Image
          accessible={false}
          blurRadius={WASH_BLUR}
          cachePolicy="memory-disk"
          contentFit="fill"
          onError={() => setFailedUrl(lastUrl)}
          priority="low"
          source={source}
          style={[
            styles.washImage,
            {
              transform: [
                { scaleX: (box.width / WASH_VIEW) * 1.12 },
                { scaleY: (box.height / WASH_VIEW) * 1.12 },
              ],
            },
          ]}
          transition={{
            duration: motion.duration.ambient,
            effect: 'cross-dissolve',
            timing: 'ease-in-out',
          }}
        />
        {/*
          A light film grade: tungsten from the top left, moonlight from the
          bottom right. It keeps a white or grey cover from washing the screen
          in flat grey, and ties very different covers into one look.
        */}
        <LinearGradient
          colors={[
            'rgba(245, 168, 60, 0.22)',
            'rgba(120, 110, 160, 0.055)',
            'rgba(70, 95, 210, 0.22)',
          ]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: ink(dim) }]} />
      </Animated.View>

      {/*
        The vignette. Vertically: dark under the status bar, clear behind the
        cover, then a long fall to black. Horizontally: darker at the edges, so
        the wash reads as light spilling from the cover, not as a tinted panel.
      */}
      <LinearGradient
        colors={[ink(0.72), ink(0.12), ink(0), ink(0.8), colors.bg]}
        locations={[0, 0.22, 0.36, 0.72, 0.95]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[ink(0.5), ink(0), ink(0), ink(0.5)]}
        end={{ x: 1, y: 0.5 }}
        locations={[0, 0.32, 0.68, 1]}
        start={{ x: 0, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />

      {grain ? (
        <TiledImage
          accessible={false}
          resizeMode="repeat"
          source={require('@/assets/images/grain.png')}
          style={[StyleSheet.absoluteFill, styles.grain]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  haze: {
    backgroundImage:
      'radial-gradient(circle at 50% 28%, rgba(245, 168, 60, 0.16) 0%, rgba(245, 168, 60, 0) 55%)',
  },
  wash: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  washImage: {
    width: WASH_VIEW,
    height: WASH_VIEW,
  },
  grain: {
    width: '100%',
    height: '100%',
    opacity: 0.55,
  },
});

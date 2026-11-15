import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CoverMosaic } from '@/components/ui';
import { colors, layout, motion, radius, shadows, space } from '@/theme';

export type LeadPhotoProps = {
  uri: string;
  /** Up to four cover URLs, set small in the corner so the photo still reads as a soundtrack. */
  covers?: readonly string[];
  /** Width over height. @default 3 / 2 */
  aspect?: number;
  /** Draw the deep soft shadow. @default false */
  shadow?: boolean;
  /** The photo could not be loaded: show the cover mosaic instead. */
  onError?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A soundtrack's lead image: the owner's photo across the full width, with
 * the cover mosaic as a small inset.
 *
 *   <LeadPhoto uri={item.leadPhotoUrl} covers={mosaicCovers(item.entries)} onError={useMosaic} />
 */
export function LeadPhoto({
  uri,
  covers,
  aspect = 3 / 2,
  shadow = false,
  onError,
  accessibilityLabel,
  style,
  testID,
}: LeadPhotoProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={!!accessibilityLabel}
      style={[styles.frame, { aspectRatio: aspect }, shadow ? shadows.cover : null, style]}
      testID={testID}>
      <View style={styles.clip}>
        <Image
          accessible={false}
          cachePolicy="memory-disk"
          contentFit="cover"
          onError={onError}
          source={uri}
          style={StyleSheet.absoluteFill}
          transition={motion.duration.base}
        />
        <View style={[StyleSheet.absoluteFill, styles.edge]} />
      </View>
      {covers && covers.length > 0 ? <CoverMosaic size={52} style={styles.inset} uris={covers} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
  },
  clip: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: radius.md,
    backgroundColor: colors.bgRaised,
  },
  edge: {
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  inset: {
    position: 'absolute',
    left: space.md,
    bottom: space.md,
    ...shadows.raised,
  },
});

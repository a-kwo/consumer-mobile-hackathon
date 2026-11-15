import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, motion, radius, sizes } from '@/theme';

export type LeadPhotoProps = {
  uri: string;
  /** Edge length of the square slot. @default the soundtrack cover size (116) */
  size?: number;
  /** The photo could not be loaded: show the cover mosaic instead. */
  onError?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A soundtrack's lead image: the owner's photo, set in the cover's own slot
 * (the same square and the same corner radius), so the layout around it is
 * the same with or without a photo.
 *
 *   <LeadPhoto uri={item.leadPhotoUrl} onError={useMosaic} />
 */
export function LeadPhoto({
  uri,
  size = sizes.soundtrackCover,
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
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size <= 64 ? radius.thumb : radius.cover },
        style,
      ]}
      testID={testID}>
      <Image
        accessible={false}
        cachePolicy="memory-disk"
        contentFit="cover"
        onError={onError}
        source={uri}
        style={StyleSheet.absoluteFill}
        transition={motion.duration.base}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.paperRaised,
  },
});

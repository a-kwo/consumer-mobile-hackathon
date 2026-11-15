import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon, PressableScale } from '@/components/ui';
import { colors, ink, layout, motion, radius, space } from '@/theme';

export type PhotoStripProps = {
  photos: readonly { key: string; url: string }[];
  /** Makes each photo a button that asks to remove it. */
  onRemove?: (key: string) => void;
  disabled?: boolean;
  /** Photos get `${testID}-1`, `${testID}-2` and so on. */
  testID: string;
};

const SIZE = 64;

/** A soundtrack's photos as a row of thumbnails, oldest first. */
export function PhotoStrip({ photos, onRemove, disabled, testID }: PhotoStripProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.row}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      testID={testID}>
      {photos.map((photo, index) => {
        const image = (
          <View style={styles.thumb}>
            <Image
              accessible={false}
              cachePolicy="memory-disk"
              contentFit="cover"
              source={photo.url}
              style={StyleSheet.absoluteFill}
              transition={motion.duration.base}
            />
            {onRemove ? (
              <View style={styles.badge}>
                <Icon name="close" size={12} />
              </View>
            ) : null}
          </View>
        );
        return onRemove ? (
          <PressableScale
            accessibilityHint="Removes this photo from the soundtrack"
            accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
            accessibilityRole="button"
            disabled={disabled}
            key={photo.key}
            onPress={() => onRemove(photo.key)}
            pressedOpacity={0.7}
            testID={`${testID}-${index + 1}`}>
            {image}
          </PressableScale>
        ) : (
          <View
            accessibilityLabel={`Photo ${index + 1} of ${photos.length}`}
            accessibilityRole="image"
            accessible
            key={photo.key}
            testID={`${testID}-${index + 1}`}>
            {image}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
  },
  row: {
    gap: space.sm,
  },
  thumb: {
    width: SIZE,
    height: SIZE,
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.bgRaised,
  },
  badge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ink(0.7),
  },
});

import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { space } from '@/theme';

import { AppText } from './app-text';
import type { HapticKind } from './haptics';
import { Icon } from './icon';
import { PressableScale } from './pressable-scale';

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** A line of muted meta text above the title: "6:12 PM". */
  overline?: string;
  /** Left slot: a `CoverArt`, `CoverMosaic` or `Avatar`. */
  leading?: ReactNode;
  /** Right slot: a time, `EqualizerBars`, a `Chip`, an `IconButton`. */
  trailing?: ReactNode;
  /** Makes the whole row tappable. */
  onPress?: () => void;
  /**
   * `serif` sets the title in Fraunces (17 / 22), for a soundtrack entry's
   * generated title. @default 'sans'
   */
  titleStyle?: 'sans' | 'serif';
  /** Mark the row as the one that is playing: its title is set a weight heavier. */
  active?: boolean;
  /** Show a chevron at the far right, for rows that open something. */
  chevron?: boolean;
  disabled?: boolean;
  /** @default 'tap' */
  haptic?: HapticKind | false;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * One line of a tracklist or feed: a leading visual, up to three lines of
 * text and a trailing slot.
 *
 *   <ListRow
 *     title="Rain on 4th Street"
 *     titleStyle="serif"
 *     subtitle="No Surprises · Radiohead"
 *     leading={<CoverArt uri={play.coverUrl} size={sizes.thumb} />}
 *     trailing={<IconButton icon="play" size="sm" accessibilityLabel="Replay" />}
 *     active={isThisRow}
 *     onPress={() => replay(play)}
 *   />
 */
export function ListRow({
  title,
  subtitle,
  overline,
  leading,
  trailing,
  onPress,
  titleStyle = 'sans',
  active = false,
  chevron = false,
  disabled,
  haptic = 'tap',
  accessibilityLabel,
  style,
  testID,
}: ListRowProps) {
  const content = (
    <>
      {leading}
      <View style={styles.text}>
        {overline ? (
          <AppText numberOfLines={1} variant="meta">
            {overline}
          </AppText>
        ) : null}
        <AppText
          numberOfLines={titleStyle === 'serif' ? 2 : 1}
          style={active ? styles.active : null}
          variant={titleStyle === 'serif' ? 'entryTitle' : 'title'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText numberOfLines={1} variant="meta">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron-forward" size={16} tone="muted" /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.row, style]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <PressableScale
      accessibilityLabel={
        accessibilityLabel ?? [overline, title, subtitle].filter(Boolean).join(', ')
      }
      accessibilityState={{ selected: active }}
      containerStyle={[styles.container, style]}
      disabled={disabled}
      fill
      haptic={haptic}
      onPress={onPress}
      pressedOpacity={0.6}
      scaleTo={0.985}
      style={styles.row}
      testID={testID}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 72,
    paddingVertical: space.md,
  },
  active: {
    fontWeight: '600',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});

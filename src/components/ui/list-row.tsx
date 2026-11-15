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
  /** A film-credits label above the title: "Cue 07", "6:12 PM". */
  overline?: string;
  /** Left slot: a `CoverArt`, `CoverMosaic` or `Avatar`. */
  leading?: ReactNode;
  /** Right slot: a time, `EqualizerBars`, a `Chip`, an `IconButton`. */
  trailing?: ReactNode;
  /** Makes the whole row tappable. */
  onPress?: () => void;
  /**
   * `serif` sets the title in Instrument Serif, for generated cue titles such
   * as "Rain on 4th Street". @default 'sans'
   */
  titleStyle?: 'sans' | 'serif';
  /** Mark the row as the one that is playing: the title turns amber. */
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
 *     overline="Cue 07"
 *     title="Rain on 4th Street"
 *     titleStyle="serif"
 *     subtitle="Night Drive · Cinematic Orchestra"
 *     leading={<CoverArt uri={play.coverUrl} size={52} shadow={false} />}
 *     trailing={<EqualizerBars playing={isThisRow} size={14} />}
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
          <AppText numberOfLines={1} variant="overline">
            {overline}
          </AppText>
        ) : null}
        <AppText
          numberOfLines={titleStyle === 'serif' ? 2 : 1}
          tone={active ? 'accent' : 'primary'}
          variant={titleStyle === 'serif' ? 'displaySmall' : 'title'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText numberOfLines={1} variant="caption">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {chevron ? <Icon name="chevron-forward" size={16} tone="tertiary" /> : null}
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
    minHeight: 56,
    paddingVertical: space.sm + 2,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
});

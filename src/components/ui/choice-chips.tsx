import { ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

export type ChoiceChipsProps<T extends string> = {
  options: readonly ChoiceOption<T>[];
  /** The selected value, or `null` for none. */
  value: T | null;
  onChange: (value: T) => void;
  /**
   * Points the row extends past its parent on each side, so options scroll
   * out to the screen edge instead of being cut at the page margin. Directly
   * inside a padded `Screen`, pass `layout.screenPadding`. @default 0
   */
  bleed?: number;
  disabled?: boolean;
  /** Names the group for screen readers: "Weather". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * A single-select row of options that scrolls sideways when it does not fit.
 * Each option is a paperSunk button; the selected one is ink with paper text.
 *
 *   <ChoiceChips
 *     accessibilityLabel="Weather"
 *     bleed={layout.screenPadding}
 *     value={weather}
 *     onChange={setWeather}
 *     options={[{ value: 'clear', label: 'Clear' }, { value: 'rain', label: 'Rain' }]}
 *   />
 */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  bleed = 0,
  disabled,
  accessibilityLabel,
  style,
  testID,
}: ChoiceChipsProps<T>) {
  return (
    <ScrollView
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      contentContainerStyle={[styles.content, { paddingHorizontal: bleed }]}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, { marginHorizontal: -bleed }, style]}
      testID={testID}>
      {options.map((option) => {
        const selected = option.value === value;
        const foreground = selected ? colors.paper : colors.ink;
        return (
          <PressableScale
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            disabled={disabled}
            haptic="select"
            hitSlop={{ top: 2, bottom: 2 }}
            key={option.value}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            pressedStyle={selected ? styles.selectedPressed : styles.pressed}
            style={[styles.chip, selected ? styles.selected : null]}>
            {option.icon ? <Icon color={foreground} name={option.icon} size={16} /> : null}
            <AppText numberOfLines={1} style={{ color: foreground }} variant="button">
              {option.label}
            </AppText>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    alignItems: 'center',
    gap: space.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: space.lg - 2,
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
  },
  pressed: {
    backgroundColor: colors.paperPressed,
  },
  selected: {
    backgroundColor: colors.ink,
  },
  selectedPressed: {
    backgroundColor: colors.inkSoft,
  },
});

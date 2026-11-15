import { StyleSheet, View } from 'react-native';

import { AppText, Icon, PressableScale, type IconName } from '@/components/ui';
import { colors, radius, sizes, space } from '@/theme';

export type Option<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Each option gets the testID `${testIDPrefix}-${option.value}`. */
  testIDPrefix: string;
  /** Names the group for screen readers. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * A single-select group of options that wraps onto further rows, so every
 * choice is on screen at once and each one has its own testID (the kit's
 * `ChoiceChips` scrolls sideways and has one testID for the row). Options are
 * paperSunk controls; the chosen one is filled with ink.
 */
export function OptionChips<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
  accessibilityLabel,
  disabled,
}: Props<T>) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="radiogroup" style={styles.wrap}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            accessibilityLabel={`${accessibilityLabel}: ${option.label}`}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            disabled={disabled}
            haptic="select"
            key={option.value}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            pressedStyle={selected ? styles.selectedPressed : styles.pressed}
            style={[styles.option, selected ? styles.selected : null]}
            testID={`${testIDPrefix}-${option.value}`}>
            {option.icon ? (
              <Icon color={selected ? colors.paper : colors.inkMuted} name={option.icon} size={16} />
            ) : null}
            <AppText numberOfLines={1} tone={selected ? 'onInk' : 'primary'} variant="button">
              {option.label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: sizes.primary,
    paddingHorizontal: space.md + 2,
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

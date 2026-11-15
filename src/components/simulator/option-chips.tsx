import { StyleSheet, View } from 'react-native';

import { AppText, Icon, PressableScale, type IconName } from '@/components/ui';
import { colors, layout, radius, space } from '@/theme';

export type Option<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Each chip gets the testID `${testIDPrefix}-${option.value}`. */
  testIDPrefix: string;
  /** Names the group for screen readers. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * A single-select group of chips that wraps onto further rows, so every choice
 * is on screen at once and each one has its own testID. It looks like the
 * kit's `ChoiceChips`, which scrolls sideways and has one testID for the row.
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
            style={[styles.chip, selected ? styles.selected : null]}
            testID={`${testIDPrefix}-${option.value}`}>
            {option.icon ? (
              <Icon
                color={selected ? colors.accent : colors.textSecondary}
                name={option.icon}
                size={16}
              />
            ) : null}
            <AppText
              numberOfLines={1}
              style={{ color: selected ? colors.text : colors.textSecondary }}
              variant="label">
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
  selected: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorder,
  },
  selectedPressed: {
    backgroundColor: 'rgba(245, 168, 60, 0.24)',
  },
});

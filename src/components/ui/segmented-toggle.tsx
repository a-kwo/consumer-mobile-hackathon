import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { colors, layout, motion, radius, space } from '@/theme';

import { AppText } from './app-text';
import { haptics } from './haptics';
import { Icon, type IconName } from './icon';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
};

export type SegmentedToggleProps<T extends string> = {
  /** Two or three options. */
  options:
    | readonly [SegmentOption<T>, SegmentOption<T>]
    | readonly [SegmentOption<T>, SegmentOption<T>, SegmentOption<T>];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Names the control for screen readers: "Context source". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const INSET = 3;

/**
 * A two- or three-way switch with a thumb that slides under the selection.
 * For the simulator's "Live sensors / Simulated" toggle.
 *
 *   <SegmentedToggle
 *     accessibilityLabel="Context source"
 *     value={mode}
 *     onChange={setMode}
 *     options={[
 *       { value: 'live', label: 'Live', icon: 'radio-outline' },
 *       { value: 'simulated', label: 'Simulated', icon: 'options-outline' },
 *     ]}
 *   />
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: SegmentedToggleProps<T>) {
  const reduceMotion = useReducedMotion();
  const count = options.length;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radiogroup"
      style={[styles.track, disabled ? styles.disabled : null, style]}
      testID={testID}>
      <View style={styles.inner}>
        <Animated.View
          style={[
            styles.thumb,
            {
              width: `${100 / count}%`,
              left: `${(selectedIndex * 100) / count}%`,
              transitionProperty: 'left',
              transitionDuration: reduceMotion ? 0 : motion.duration.base,
              transitionTimingFunction: motion.easing.out,
            },
          ]}
        />
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              key={option.value}
              onPress={() => {
                if (selected) return;
                haptics.select();
                onChange(option.value);
              }}
              style={styles.segment}>
              {option.icon ? (
                <Icon
                  color={selected ? colors.text : colors.textTertiary}
                  name={option.icon}
                  size={16}
                />
              ) : null}
              <AppText
                numberOfLines={1}
                style={[styles.label, { color: selected ? colors.text : colors.textSecondary }]}
                variant="label">
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'stretch',
    height: 46,
    padding: INSET,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  disabled: {
    opacity: 0.4,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: radius.pill,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surfacePressed,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
  },
  label: {
    flexShrink: 1,
  },
});

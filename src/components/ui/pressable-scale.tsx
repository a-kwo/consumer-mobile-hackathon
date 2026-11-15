import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { motion } from '@/theme';

import { haptics, type HapticKind } from './haptics';

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children?: ReactNode;
  /** Style of the visible, animated element (size, fill, border, padding). */
  style?: StyleProp<ViewStyle>;
  /** Merged into `style` while pressed, for example a lighter fill. */
  pressedStyle?: StyleProp<ViewStyle>;
  /** Layout of the control within its parent: margins, `flex`, `alignSelf`. */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * Stretch the control to fill `containerStyle`. By default a control hugs
   * its content, whatever the parent's `alignItems`.
   */
  fill?: boolean;
  /** Haptic fired when the press is committed. `false` for none. @default 'tap' */
  haptic?: HapticKind | false;
  /** Scale while pressed. @default 0.96 */
  scaleTo?: number;
  /** Opacity while pressed, for elements with no fill to lighten (rows, covers). @default 1 */
  pressedOpacity?: number;
};

/**
 * The press behaviour shared by every tappable thing in the kit: the element
 * eases down to a slightly smaller scale while held, comes back on release,
 * fires a haptic when the press commits and dims when disabled.
 *
 * A control built on this hugs its content in any parent: it does not stretch
 * across a column, and it centres itself on the cross axis of a row. Pass
 * `fill` (with a `containerStyle` such as `{ flex: 1 }`) to make it stretch.
 *
 * Use the kit's buttons and rows first. Reach for this to make a custom
 * element (a cover, a card) pressable with the same feel.
 */
export function PressableScale({
  children,
  style,
  pressedStyle,
  containerStyle,
  fill = false,
  haptic = 'tap',
  scaleTo = motion.pressScale,
  pressedOpacity = 1,
  disabled,
  onPress,
  onPressIn,
  onPressOut,
  accessibilityRole = 'button',
  accessibilityState,
  ...rest
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const reduceMotion = useReducedMotion();
  const isDisabled = !!disabled;

  const handlePressIn = (event: GestureResponderEvent) => {
    setPressed(true);
    onPressIn?.(event);
  };
  const handlePressOut = (event: GestureResponderEvent) => {
    setPressed(false);
    onPressOut?.(event);
  };
  const handlePress = (event: GestureResponderEvent) => {
    if (haptic) haptics[haptic]();
    onPress?.(event);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        accessibilityRole={accessibilityRole}
        accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
        disabled={isDisabled}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={fill ? styles.fill : undefined}
        {...rest}>
        <Animated.View
          style={[
            style,
            pressed ? pressedStyle : null,
            {
              opacity: isDisabled ? 0.38 : pressed ? pressedOpacity : 1,
              transform: [{ scale: pressed && !reduceMotion ? scaleTo : 1 }],
              transitionProperty: ['transform', 'opacity', 'backgroundColor', 'borderColor'],
              transitionDuration: motion.duration.press,
              transitionTimingFunction: motion.easing.out,
            },
          ]}>
          {children}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // A row that centres its one child: the child hugs its content on the main
  // axis and is centred on the cross axis, whatever the parent does.
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fill: {
    flex: 1,
  },
});

import { Pressable, StyleSheet } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { CymaticFigure } from '@/components/figure/cymatic-figure';
import { REF_HEIGHT, REF_WIDTH } from '@/components/figure/figure-tuning';
import { AppText, haptics } from '@/components/ui';
import { colors, shadows } from '@/theme';

/** Diameter of the button at rest. */
export const BUTTON_SIZE = 176;
/** How long a press must be held to open the presenter's sheet. */
const LONG_PRESS_MS = 600;
/** One timing for every change of state, slow enough to read. */
const TRANSFORM_MS = 700;

/**
 * `rest`: the big button, waiting. `reading`: it has drawn in to a small
 * centre while the moment is read. `away`: gone, once the scene is set.
 */
export type InstrumentPhase = 'rest' | 'reading' | 'away';

type Props = {
  phase: InstrumentPhase;
  /** Height of the stage in points. It changes with the phase, and the change is eased. */
  height: number;
  /** Width of the figure at rest: the window width. */
  figureWidth: number;
  /** 0 to 1. The figure gains lobes and tightens as it rises. */
  energy: number;
  /** A change scatters the grains, then they resettle: pass a count of findings. */
  kick: number;
  /** Stop the figure's frame loop: the screen is hidden. */
  active: boolean;
  label: string;
  onPress: () => void;
  onLongPress: () => void;
};

const breathe = css.keyframes({
  '0%': { transform: [{ scale: 1 }] },
  '50%': { transform: [{ scale: 1.035 }] },
  '100%': { transform: [{ scale: 1 }] },
});

const SCALE: Record<InstrumentPhase, { figure: number; button: number }> = {
  rest: { figure: 1, button: 1 },
  reading: { figure: 0.5, button: 0.36 },
  away: { figure: 0.3, button: 0.1 },
};

/**
 * The centre of the Scene screen: one large ink button with the cymatic
 * figure settling quietly around it, like the middle of an instrument. When
 * the scene is being read the button draws in to a small centre and the
 * figure tightens around it; when the scene is set both dissolve.
 *
 * A long press opens the presenter's sheet. Nothing on screen hints at it.
 */
export function Instrument({
  phase,
  height,
  figureWidth,
  energy,
  kick,
  active,
  label,
  onPress,
  onLongPress,
}: Props) {
  const reduceMotion = useReducedMotion();
  const ms = reduceMotion ? 0 : TRANSFORM_MS;
  const scale = SCALE[phase];
  const visible = phase !== 'away';
  const figureHeight = Math.round((figureWidth * REF_HEIGHT) / REF_WIDTH);
  const transition = {
    transitionProperty: ['transform', 'opacity'] as ('transform' | 'opacity')[],
    transitionDuration: ms,
    transitionTimingFunction: 'ease-in-out' as const,
  };

  return (
    <Animated.View
      style={[
        styles.stage,
        {
          height,
          transitionProperty: 'height',
          transitionDuration: ms,
          transitionTimingFunction: 'ease-in-out',
        },
      ]}>
      {/* The figure. Larger than the stage by design; it has faded to paper before its edge. */}
      <Animated.View
        style={[
          styles.figure,
          { width: figureWidth, height: figureHeight, opacity: visible ? 1 : 0 },
          { transform: [{ scale: scale.figure }] },
          transition,
        ]}>
        <CymaticFigure
          active={active && visible}
          bpm={phase === 'reading' ? 110 : 56}
          color={colors.inkMuted}
          energy={energy}
          height={figureHeight}
          paperColor={colors.paper}
          playing
          trackId={kick}
          width={figureWidth}
        />
      </Animated.View>

      <Animated.View
        style={[{ opacity: visible ? 1 : 0, transform: [{ scale: scale.button }] }, transition]}>
        <Animated.View
          style={
            phase === 'rest' && !reduceMotion
              ? {
                  animationName: breathe,
                  animationDuration: 5200,
                  animationIterationCount: 'infinite',
                  animationTimingFunction: 'ease-in-out',
                }
              : null
          }>
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ disabled: phase !== 'rest', busy: phase === 'reading' }}
            delayLongPress={LONG_PRESS_MS}
            disabled={phase !== 'rest'}
            onLongPress={() => {
              haptics.select();
              onLongPress();
            }}
            onPress={() => {
              haptics.press();
              onPress();
            }}
            style={({ pressed }) => [styles.button, shadows.cover, pressed ? styles.pressed : null]}
            testID="scene-set">
            <Animated.View style={[{ opacity: phase === 'rest' ? 1 : 0 }, transition]}>
              <AppText align="center" style={styles.label} tone="onInk" variant="wordmark">
                {label}
              </AppText>
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  figure: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  pressed: {
    backgroundColor: colors.inkSoft,
  },
  label: {
    maxWidth: BUTTON_SIZE - 48,
  },
});

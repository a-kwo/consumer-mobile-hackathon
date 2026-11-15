import { StyleSheet, View } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { colors, layout, space } from '@/theme';

import { Rise } from './motion';

type Props = {
  /** Step id, for the testIDs `scene-step-<id>` and `scene-step-<id>-detail`. */
  id: string;
  /** The short label at the left: "Place", "Weather". */
  label: string;
  /** While working: what is being done ("Finding where you are"). Done: the finding. */
  text: string;
  working: boolean;
  /** Draw a hairline above the row. */
  divided: boolean;
};

const breathe = css.keyframes({
  '0%': { opacity: 0.45 },
  '50%': { opacity: 1 },
  '100%': { opacity: 0.45 },
});

/**
 * One line of the reading: a label and what was found. While the step is
 * being worked on, its present-tense line breathes in muted ink; when it
 * resolves, the finding settles in its place in ink.
 */
export function FindingRow({ id, label, text, working, divided }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <Rise duration={420} style={styles.wrap} testID={`scene-step-${id}`}>
      {divided ? <View style={styles.rule} /> : null}
      <View
        accessibilityLabel={`${label}: ${text}`}
        accessibilityLiveRegion="polite"
        accessible
        style={styles.row}>
        <AppText numberOfLines={1} style={styles.label} tone="muted" variant="meta">
          {label}
        </AppText>
        {working ? (
          <Animated.View
            key="working"
            style={[
              styles.value,
              reduceMotion
                ? null
                : {
                    animationName: breathe,
                    animationDuration: 1400,
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                  },
            ]}>
            <AppText numberOfLines={1} tone="muted" variant="body">
              {text}…
            </AppText>
          </Animated.View>
        ) : (
          // Keyed by the finding, so each new one settles in rather than snapping.
          <Rise duration={380} key={`done-${text}`} style={styles.value}>
            <AppText numberOfLines={1} testID={`scene-step-${id}-detail`} variant="body">
              {text}
            </AppText>
          </Rise>
        )}
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  rule: {
    height: layout.hairline,
    backgroundColor: colors.hairline,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    height: 40,
  },
  label: {
    width: 76,
  },
  value: {
    flex: 1,
  },
});

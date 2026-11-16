import { StyleSheet, View } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { AppText } from '@/components/ui';
import { colors, fonts, space } from '@/theme';

import { CROSS_FADE_OUT_MS, Rise, useCrossFade } from './motion';
import { clauseText, type Part } from './passage';

/** One line of the passage: a step still being worked on, or its finished clause. */
export type PassageLine = {
  /** Step id, for the testIDs `scene-step-<id>` and `scene-step-<id>-detail`. */
  id: string;
  /** While the step works: its present-tense phrase ("Finding where you are"). */
  working: string | null;
  /** Once it has resolved: the clause. */
  parts: Part[] | null;
  /** Start a new paragraph: a little more air above this line. */
  apart?: boolean;
};

const breathe = css.keyframes({
  '0%': { opacity: 0.4 },
  '50%': { opacity: 0.95 },
  '100%': { opacity: 0.4 },
});

function Clause({ line, compact }: { line: PassageLine; compact: boolean }) {
  const reduceMotion = useReducedMotion();
  const text = line.parts ? clauseText(line.parts) : `${line.working ?? ''}…`;
  // When the words change (the phrase resolves, or the moment moves on), the
  // old ones fade and sink a little, then the new ones fade and settle.
  const shown = useCrossFade(line, text);
  const { parts, working } = shown.value;
  const size = compact ? styles.sizeCompact : styles.size;
  const firstStrong = parts ? parts.findIndex((part) => part.strong) : -1;

  return (
    <Rise duration={460} style={line.apart ? styles.apart : null} testID={`scene-step-${line.id}`}>
      <Animated.View
        style={{
          opacity: shown.visible ? 1 : 0,
          transform: [{ translateY: shown.visible || reduceMotion ? 0 : 6 }],
          transitionProperty: ['opacity', 'transform'],
          transitionDuration: reduceMotion ? 0 : shown.visible ? 560 : CROSS_FADE_OUT_MS,
          transitionTimingFunction: 'ease-out',
        }}>
        {parts ? (
          <AppText accessibilityLabel={clauseText(parts)} style={[styles.quiet, size]}>
            {parts.map((part, index) => {
              if (!part.strong) return part.text;
              const testID = index === firstStrong ? `scene-step-${line.id}-detail` : undefined;
              return (
                <AppText key={index} style={[styles.strong, size]} testID={testID}>
                  {part.text}
                </AppText>
              );
            })}
          </AppText>
        ) : (
          <Animated.View
            style={
              reduceMotion
                ? null
                : {
                    animationName: breathe,
                    animationDuration: 1500,
                    animationIterationCount: 'infinite',
                    animationTimingFunction: 'ease-in-out',
                  }
            }>
            <AppText accessibilityLabel={working ?? undefined} style={[styles.working, size]}>
              {working}…
            </AppText>
          </Animated.View>
        )}
      </Animated.View>
    </Rise>
  );
}

type Props = {
  lines: readonly PassageLine[];
  /** Tighter type for short phones. */
  compact: boolean;
};

/**
 * The passage: the moment told back in a few sentences, set in Fraunces. The
 * findings are in ink at a medium weight; the words that join them are
 * quieter. A step still being worked on shows as an unfinished phrase in
 * muted italic that breathes, and resolves into its clause with a soft settle.
 *
 * The container is `scene-sentence`; each clause is `scene-step-<id>` and its
 * first finding `scene-step-<id>-detail`.
 */
export function PassageView({ lines, compact }: Props) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.passage} testID="scene-sentence">
      {lines.map((line) => (
        <Clause compact={compact} key={line.id} line={line} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  passage: {
    alignSelf: 'stretch',
    gap: space.xxs,
  },
  apart: {
    marginTop: space.md,
  },
  size: {
    fontSize: 19,
    lineHeight: 28,
  },
  sizeCompact: {
    fontSize: 17,
    lineHeight: 24,
  },
  quiet: {
    fontFamily: fonts.serif,
    color: colors.inkMuted,
  },
  strong: {
    fontFamily: fonts.serifMedium,
    color: colors.ink,
  },
  working: {
    fontFamily: fonts.serifItalic,
    color: colors.inkMuted,
  },
});

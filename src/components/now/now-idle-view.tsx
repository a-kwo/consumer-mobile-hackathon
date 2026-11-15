import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, BrandMark, Notice, PrimaryButton } from '@/components/ui';
import type { ReplayApi, SensingApi, SessionApi } from '@/lib/score';
import { colors, layout, space } from '@/theme';

import { ContextChips } from './context-chips';
import { capitalise } from './format';
import { ModeBadge } from './mode-badge';
import { ReplayBanner } from './replay-banner';

type Props = {
  session: SessionApi;
  sensing: SensingApi;
  replay: ReplayApi;
};

/** One line about where the context will come from, or null when there is nothing to add. */
function sourceLine(sensing: SensingApi): string | null {
  const { mode, liveAvailable, permissions } = sensing;
  if (mode === 'simulated') {
    return liveAvailable
      ? 'Using the values set on the Simulator tab.'
      : 'No step sensor on this device, so the Simulator tab sets the scene.';
  }
  const motionDenied = permissions.motion === 'denied';
  const locationDenied = permissions.location === 'denied';
  if (motionDenied && locationDenied) {
    return 'Motion and location access are off, so Score cannot follow your pace or the weather. Turn them on in Settings.';
  }
  if (motionDenied) return 'Motion access is off, so your pace is estimated from GPS speed.';
  if (locationDenied) return 'Location access is off, so the weather is unknown and pace comes from steps alone.';
  return null;
}

/**
 * The Now screen before a session: the brand, the invitation, a live preview
 * of the scene a first cue would be picked for, and the one start control.
 */
export function NowIdleView({ session, sensing, replay }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < 720;
  const replaying = replay.status !== 'idle';
  const note = sourceLine(sensing);
  const denied =
    sensing.mode === 'live' &&
    (sensing.permissions.motion === 'denied' || sensing.permissions.location === 'denied');

  return (
    <View style={styles.root}>
      <View style={styles.slate}>
        <ModeBadge active={false} mode={sensing.mode} />
        <AppText numberOfLines={1} variant="overline">
          An original soundtrack
        </AppText>
      </View>

      <View style={[styles.stage, compact ? styles.stageCompact : null]}>
        <View style={styles.brand}>
          <BrandMark size={compact ? 44 : 56} />
          <AppText accessibilityRole="header" align="center" variant="displayLarge">
            Score
          </AppText>
          <AppText align="center" tone="secondary" variant="serifItalic">
            Press play. Walk. We’ll score it.
          </AppText>
        </View>

        <View style={styles.rule} />

        <View style={styles.preview}>
          <AppText align="center" variant="overline">
            Right now
          </AppText>
          <View style={styles.previewLabel}>
            <AppText
              adjustsFontSizeToFit
              align="center"
              minimumFontScale={0.8}
              numberOfLines={2}
              testID="now-scene-label"
              variant="displaySmall">
              {capitalise(sensing.scene.label)}
            </AppText>
          </View>
          <ContextChips context={sensing.context} />
        </View>
      </View>

      <View style={styles.footer}>
        {replaying ? <ReplayBanner replay={replay} /> : null}
        {session.error ? (
          <Notice
            actionLabel="Try again"
            message={session.error}
            onAction={session.start}
            testID="now-error"
            title="The score stopped"
            tone="error"
          />
        ) : null}
        <PrimaryButton
          accessibilityLabel={replaying ? 'Start live scoring' : 'Start scoring'}
          fullWidth
          icon="play"
          label={replaying ? 'Start live scoring' : 'Start scoring'}
          onPress={session.start}
          testID="now-start"
        />
        <View style={styles.note}>
          {note ? (
            <AppText
              align="center"
              numberOfLines={2}
              testID="now-source-note"
              tone={denied ? 'accent' : 'tertiary'}
              variant="caption">
              {replaying ? 'Starting stops the replay. ' : ''}
              {note}
            </AppText>
          ) : replaying ? (
            <AppText align="center" tone="tertiary" variant="caption">
              Starting stops the replay.
            </AppText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
  },
  slate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    height: 26,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
  },
  stageCompact: {
    gap: space.lg,
  },
  brand: {
    alignItems: 'center',
    gap: space.sm,
  },
  rule: {
    width: 40,
    height: layout.hairline,
    backgroundColor: colors.hairlineStrong,
  },
  preview: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: space.md,
  },
  previewLabel: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  footer: {
    gap: space.md,
  },
  note: {
    minHeight: 36,
    justifyContent: 'flex-start',
  },
});

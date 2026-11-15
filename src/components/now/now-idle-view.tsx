import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Notice, PrimaryButton } from '@/components/ui';
import type { ReplayApi, SensingApi, SessionApi } from '@/lib/score';
import { space } from '@/theme';

import { CoverStage } from './cover-stage';
import { metaLine, sceneSentence } from './format';
import { NowHeader } from './now-header';
import { ReplayBanner } from './replay-banner';

type Props = {
  session: SessionApi;
  sensing: SensingApi;
  replay: ReplayApi;
};

/** One line about where the scene will come from, or null when there is nothing to add. */
function sourceLine(sensing: SensingApi): string | null {
  const { mode, permissions } = sensing;
  // The engine calls the hand-set mode 'simulated'; to the user it is their own scene.
  if (mode === 'simulated') return 'Scoring the scene you set. Change it on the Scene tab.';
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
 * The Now screen before a session: the wordmark, a quiet paper cover waiting
 * for its first song, the scene as it is right now, and the one control that
 * starts the score.
 */
export function NowIdleView({ session, sensing, replay }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < 720;
  const replaying = replay.status !== 'idle';
  const note = sourceLine(sensing);
  const { scene } = sensing;

  return (
    <View style={[styles.root, compact ? styles.rootCompact : null]}>
      <NowHeader mode={sensing.mode} />

      <CoverStage
        bpm={scene.bpm ?? 90}
        coverUrl={replay.item?.coverUrl ?? null}
        energy={scene.energy}
        trackId={null}
      />

      <View style={styles.text}>
        <AppText numberOfLines={1} testID="now-scene-label" tone="muted" variant="sceneLine">
          {sceneSentence(scene)}
        </AppText>
        <AppText
          accessibilityRole="header"
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          numberOfLines={2}
          style={compact ? styles.titleCompact : null}
          variant="songTitle">
          Press play. Walk.{'\n'}We’ll score it.
        </AppText>
        <AppText numberOfLines={1} testID="now-context" tone="muted" variant="meta">
          {metaLine(sensing.context)}
        </AppText>
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
          size="lg"
          testID="now-start"
        />
        <View style={styles.note}>
          {note || replaying ? (
            <AppText align="center" numberOfLines={2} testID="now-source-note" tone="muted" variant="meta">
              {replaying ? 'Starting stops the replay. ' : ''}
              {note}
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
  rootCompact: {
    gap: space.md,
  },
  text: {
    gap: space.xs,
  },
  titleCompact: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.28,
  },
  footer: {
    gap: space.md,
  },
  note: {
    minHeight: 40,
  },
});

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Rise } from '@/components/scene/motion';
import { AppText, Notice, PrimaryButton } from '@/components/ui';
import type { ReplayApi, SessionApi } from '@/lib/score';
import { space } from '@/theme';

import { NowHeader } from './now-header';
import { ReplayBanner } from './replay-banner';

type Props = {
  session: SessionApi;
  replay: ReplayApi;
};

/**
 * Now, with nothing playing: a quiet page that points back to Scene, where the
 * music is started. A replay in progress and the reason a score stopped are
 * still shown here.
 */
export function NowEmptyView({ session, replay }: Props) {
  const replaying = replay.status !== 'idle';
  const toScene = () => router.navigate('/');

  return (
    <View style={styles.root}>
      <NowHeader />

      <View style={styles.centre}>
        <Rise delay={80}>
          <AppText accessibilityRole="header" align="center" variant="screenTitle">
            Set the scene to begin
          </AppText>
        </Rise>
        <Rise delay={180}>
          <AppText align="center" style={styles.body} tone="muted" variant="body">
            Score reads where you are, the weather, the hour and your day, then plays what fits.
          </AppText>
        </Rise>
      </View>

      <Rise delay={280} style={styles.footer}>
        {replaying ? <ReplayBanner replay={replay} /> : null}
        {session.error ? (
          <Notice message={session.error} testID="now-error" title="The score stopped" tone="error" />
        ) : null}
        <PrimaryButton
          accessibilityLabel="Set the scene"
          fullWidth
          label="Set the scene"
          onPress={toScene}
          size="lg"
          testID="now-start"
        />
      </Rise>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: space.lg,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  body: {
    maxWidth: 300,
  },
  footer: {
    gap: space.md,
    paddingBottom: space.sm,
  },
});

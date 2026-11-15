import { StyleSheet, View } from 'react-native';

import { AppText, CoverArt, IconButton, Surface } from '@/components/ui';
import type { ReplayApi } from '@/lib/score';
import { space } from '@/theme';

import { LiveEqualizer } from './playback-readout';

/**
 * Shown on the idle Now screen while a soundtrack (or a friend's) is being
 * replayed: says so, shows what is playing and lets the user stop it.
 */
export function ReplayBanner({ replay }: { replay: ReplayApi }) {
  const { item, status } = replay;

  return (
    <Surface padding="md" style={styles.banner} testID="now-replay" variant="accent">
      <CoverArt size={48} uri={item?.coverUrl ?? null} />
      <View style={styles.text}>
        <View style={styles.heading}>
          <LiveEqualizer size={11} />
          <AppText numberOfLines={1} tone="muted" variant="meta">
            Soundtrack replay playing
          </AppText>
        </View>
        <AppText numberOfLines={1} variant="button">
          {item ? `${item.title} · ${item.artist}` : status === 'loading' ? 'Loading the replay…' : 'Replay'}
        </AppText>
      </View>
      <IconButton
        accessibilityLabel="Stop the replay"
        icon="stop"
        onPress={replay.stop}
        size="sm"
        testID="now-replay-stop"
        variant="ghost"
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
});

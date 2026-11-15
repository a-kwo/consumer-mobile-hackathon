import { useReplayBarInset } from '@/components/replay';
import { Screen } from '@/components/ui';
import { NowIdleView } from '@/components/now/now-idle-view';
import { NowPlayingView } from '@/components/now/now-playing-view';
import { useReplay, useSensing, useSession } from '@/lib/score';

/**
 * Now: the album cover with the cymatic figure around it, the scene as a
 * sentence, the song and why it was picked. Idle, the same page waits with a
 * paper cover and one control to start.
 */
export default function NowScreen() {
  const session = useSession();
  const sensing = useSensing();
  const replay = useReplay();
  // Zero unless a replay is playing: then the content ends above the replay bar.
  const replayInset = useReplayBarInset();

  const active = session.status !== 'idle';

  return (
    <Screen
      contentStyle={{ paddingBottom: replayInset }}
      testID="now-screen">
      {active ? (
        <NowPlayingView sensing={sensing} session={session} />
      ) : (
        <NowIdleView replay={replay} sensing={sensing} session={session} />
      )}
    </Screen>
  );
}

import { NowEmptyView } from '@/components/now/now-empty-view';
import { NowPlayingView } from '@/components/now/now-playing-view';
import { useReplayBarInset } from '@/components/replay';
import { Screen } from '@/components/ui';
import { useReplay, useSensing, useSession } from '@/lib/score';

/**
 * Now: the album cover with the cymatic figure around it, the scene as a
 * sentence, the song and why it was picked. The music is started from the
 * Scene tab; until it has been, this page says so and points back there.
 */
export default function NowScreen() {
  const session = useSession();
  const sensing = useSensing();
  const replay = useReplay();
  // Zero unless a replay is playing: then the content ends above the replay bar.
  const replayInset = useReplayBarInset();

  const active = session.status !== 'idle';

  return (
    <Screen contentStyle={{ paddingBottom: replayInset }} testID="now-screen">
      {active ? (
        <NowPlayingView sensing={sensing} session={session} />
      ) : (
        <NowEmptyView replay={replay} session={session} />
      )}
    </Screen>
  );
}

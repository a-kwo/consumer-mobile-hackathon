import { useReplayBarInset } from '@/components/replay';
import { Screen } from '@/components/ui';
import { NowIdleView } from '@/components/now/now-idle-view';
import { NowPlayingView } from '@/components/now/now-playing-view';
import { useReplay, useSensing, useSession } from '@/lib/score';

/**
 * Now: the title sequence. Idle, it invites a start and previews the scene;
 * once a session runs it shows the cue that is playing, the scene it was
 * picked for and why, over a wash of the cover's colour.
 */
export default function NowScreen() {
  const session = useSession();
  const sensing = useSensing();
  const replay = useReplay();
  // Zero unless a replay is playing: then the content ends above the replay bar.
  const replayInset = useReplayBarInset();

  const active = session.status !== 'idle';
  const coverUrl = active ? session.track?.coverUrl : replay.item?.coverUrl;

  return (
    <Screen
      contentStyle={{ paddingBottom: replayInset }}
      coverUrl={coverUrl ?? null}
      testID="now-screen">
      {active ? (
        <NowPlayingView sensing={sensing} session={session} />
      ) : (
        <NowIdleView replay={replay} sensing={sensing} session={session} />
      )}
    </Screen>
  );
}

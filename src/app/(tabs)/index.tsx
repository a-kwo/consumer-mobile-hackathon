import { useReplayBarInset } from '@/components/replay';
import { SceneView } from '@/components/scene/scene-view';
import { Screen } from '@/components/ui';
import { useSensing, useSession } from '@/lib/score';

/**
 * Scene: the first screen. One button sets the scene: Score reads where you
 * are, the weather, the hour, your calendar and your pace, shows each finding
 * as it arrives, picks the first song and moves to Now. Afterwards this tab is
 * the reading of the moment, kept up to date.
 */
export default function SceneScreen() {
  const sensing = useSensing();
  const session = useSession();
  // Zero unless a replay is playing: then the content ends above the replay bar.
  const replayInset = useReplayBarInset();

  return (
    <Screen contentStyle={{ paddingBottom: replayInset }} testID="scene-screen">
      <SceneView sensing={sensing} session={session} />
    </Screen>
  );
}

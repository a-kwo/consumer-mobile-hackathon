import { EmptyState, Screen } from '@/components/ui';

/** Placeholder for the Friends (feed) screen. Replace the whole file. */
export default function FriendsScreen() {
  return (
    <Screen testID="feed-screen">
      <EmptyState
        icon="people-outline"
        message="Your friends' original soundtracks, newest first. Tap one to play through its cues."
        overline="Friends"
        title="Other people's days"
      />
    </Screen>
  );
}

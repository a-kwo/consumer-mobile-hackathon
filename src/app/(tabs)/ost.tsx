import { EmptyState, Screen } from '@/components/ui';

/** Placeholder for the Soundtrack (OST) screen. Replace the whole file. */
export default function SoundtrackScreen() {
  return (
    <Screen testID="ost-screen">
      <EmptyState
        icon="musical-notes-outline"
        message="Today's cues as a tracklist, each with its generated title. Tap one to replay it, or share the day as a card."
        overline="Original soundtrack"
        title="Today, scored"
      />
    </Screen>
  );
}

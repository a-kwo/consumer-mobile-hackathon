import { router } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';

/** Placeholder for the Now screen. Replace the whole file. */
export default function NowScreen() {
  return (
    <Screen testID="now-screen">
      <EmptyState
        actionIcon="color-palette-outline"
        actionLabel="Open the design kit"
        icon="pulse-outline"
        message="The cue that is playing, the scene it was picked for and why, with start, stop, skip, calmer and more energy."
        onAction={() => router.push('/kit')}
        overline="Now scoring"
        title="The score starts here"
      />
    </Screen>
  );
}

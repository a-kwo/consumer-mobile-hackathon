import { EmptyState, Screen } from '@/components/ui';

/** Placeholder for the Simulator screen. Replace the whole file. */
export default function SimulatorScreen() {
  return (
    <Screen testID="simulator-screen">
      <EmptyState
        icon="options-outline"
        message="Sliders for cadence and hour, pickers for weather and setting, and the switch between live sensors and simulated values."
        overline="Simulator"
        title="Direct the scene"
      />
    </Screen>
  );
}

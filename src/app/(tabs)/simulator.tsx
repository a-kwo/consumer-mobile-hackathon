import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Divider,
  LabeledSlider,
  Notice,
  Screen,
  SectionHeader,
  SegmentedToggle,
  Surface,
  useScreenInsets,
} from '@/components/ui';
import {
  SETTING_META,
  WEATHER_META,
  formatCadenceWithPace,
  formatHourWithTimeOfDay,
} from '@/components/now/format';
import { ModeBadge } from '@/components/now/mode-badge';
import { useReplayBarInset } from '@/components/replay';
import { LiveReadingsCard } from '@/components/simulator/live-readings';
import { OptionChips, type Option } from '@/components/simulator/option-chips';
import { PresetGrid } from '@/components/simulator/presets';
import { ScenePreview } from '@/components/simulator/scene-preview';
import { TransportDock } from '@/components/simulator/transport-dock';
import {
  useSensing,
  useSession,
  type SensingMode,
  type Setting,
  type SimValues,
  type Weather,
} from '@/lib/score';
import { layout, space } from '@/theme';

import { SETTINGS, WEATHERS } from '../../../convex/lib/validators';

const MAX_CADENCE = 200;

const WEATHER_OPTIONS: readonly Option<Weather>[] = WEATHERS.map((value) => ({
  value,
  ...WEATHER_META[value],
}));
const SETTING_OPTIONS: readonly Option<Setting>[] = SETTINGS.map((value) => ({
  value,
  ...SETTING_META[value],
}));

/**
 * The Scene tab (the route keeps its original file name). Score either senses
 * the scene automatically or the user sets it by hand here: a moment in one
 * tap, or pace, time, weather and setting one by one. The screen previews the
 * scene those values make and carries its own transport dock.
 *
 * The engine calls the hand-set mode 'simulated'; the user sees "Manual".
 */
export default function SceneScreen() {
  const sensing = useSensing();
  const session = useSession();
  const insets = useScreenInsets();
  // Zero unless a replay is playing: then the dock's controls sit above the replay bar.
  const replayInset = useReplayBarInset();

  const { mode, liveAvailable, sim, live, setSim, setMode } = sensing;
  const isLive = mode === 'live';
  const cadence = isLive ? Math.min(MAX_CADENCE, live.cadenceSpm) : sim.cadenceSpm;
  const hour = isLive ? live.localHour : sim.localHour;

  // A moment is a hand-set scene, so choosing one also switches to manual.
  const applyPreset = (values: SimValues) => {
    if (isLive) setMode('simulated');
    setSim(values);
  };

  return (
    <Screen coverUrl={session.track?.coverUrl ?? null} edges="none" padded={false} testID="simulator-screen">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="sim-scroll">
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="overline">Scene</AppText>
            <AppText accessibilityRole="header" variant="displayMedium">
              Set the scene
            </AppText>
          </View>
          <ModeBadge active={session.status !== 'idle'} mode={mode} />
        </View>

        <SegmentedToggle<SensingMode>
          accessibilityLabel="How the scene is set"
          disabled={!liveAvailable && !isLive}
          onChange={setMode}
          options={[
            { value: 'live', label: 'Automatic', icon: 'radio-outline' },
            { value: 'simulated', label: 'Manual', icon: 'options-outline' },
          ]}
          testID="sim-mode-toggle"
          value={mode}
        />
        {!liveAvailable ? (
          <AppText align="center" style={styles.hint} testID="sim-live-unavailable" tone="tertiary" variant="caption">
            {isLive
              ? 'Without motion sensing, your pace follows GPS speed.'
              : 'Automatic needs a phone with motion sensing.'}
          </AppText>
        ) : null}
        {session.error ? (
          <Notice
            actionLabel={session.status === 'idle' ? 'Try again' : undefined}
            message={session.error}
            onAction={session.status === 'idle' ? session.start : undefined}
            testID="sim-error"
            tone={session.status === 'idle' ? 'error' : 'warning'}
          />
        ) : null}

        <ScenePreview
          energyBias={session.energyBias}
          mode={mode}
          nudgePicksLeft={session.nudgePicksLeft}
          scene={sensing.scene}
        />

        {isLive ? <LiveReadingsCard live={live} permissions={sensing.permissions} /> : null}

        <View style={styles.section}>
          <SectionHeader detail="One tap" title="Moments" />
          <PresetGrid current={isLive ? null : sim} onSelect={applyPreset} />
        </View>

        <View style={styles.section}>
          <SectionHeader detail={isLive ? 'Automatic' : undefined} title="Pace and time" />
          <Surface style={styles.sliders}>
            <LabeledSlider
              disabled={isLive}
              formatValue={formatCadenceWithPace}
              icon="walk-outline"
              label="Cadence"
              maximumLabel="200 · sprint"
              maximumValue={MAX_CADENCE}
              minimumLabel="0 · still"
              minimumValue={0}
              onValueChange={(value) => setSim({ cadenceSpm: Math.round(value) })}
              step={1}
              testID="sim-cadence-slider"
              value={cadence}
            />
            <Divider />
            <LabeledSlider
              disabled={isLive}
              formatValue={formatHourWithTimeOfDay}
              icon="time-outline"
              label="Hour"
              maximumLabel="Midnight"
              maximumValue={24}
              minimumLabel="Midnight"
              minimumValue={0}
              onValueChange={(value) => setSim({ localHour: Math.round(value * 4) / 4 })}
              step={0.25}
              testID="sim-hour-slider"
              tone="calm"
              value={hour}
            />
          </Surface>
        </View>

        <View style={styles.section}>
          <SectionHeader detail={isLive ? 'Automatic' : undefined} title="Weather" />
          <OptionChips
            accessibilityLabel="Weather"
            disabled={isLive}
            onChange={(weather) => setSim({ weather })}
            options={WEATHER_OPTIONS}
            testIDPrefix="sim-weather"
            value={isLive ? live.weather : sim.weather}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Setting" />
          <OptionChips
            accessibilityLabel="Setting"
            disabled={isLive}
            onChange={(setting) => setSim({ setting })}
            options={SETTING_OPTIONS}
            testIDPrefix="sim-setting"
            value={isLive ? sensing.context.setting : sim.setting}
          />
        </View>
      </ScrollView>

      <TransportDock bottomInset={insets.bottom + replayInset} previewScene={sensing.scene} session={session} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    gap: space.xl,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: space.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  section: {
    gap: space.md,
  },
  // Sits close under the toggle it explains.
  hint: {
    marginTop: -space.md,
  },
  sliders: {
    gap: space.lg,
  },
});

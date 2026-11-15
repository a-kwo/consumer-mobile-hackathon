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
import { KnownPlaces } from '@/components/simulator/known-places';
import { LiveReadingsCard } from '@/components/simulator/live-readings';
import { OptionChips, type Option } from '@/components/simulator/option-chips';
import { PresetGrid } from '@/components/simulator/presets';
import { ScenePreview } from '@/components/simulator/scene-preview';
import { TransportDock } from '@/components/simulator/transport-dock';
import { UpcomingEvent } from '@/components/simulator/upcoming-event';
import { WhereYouAre } from '@/components/simulator/where-you-are';
import {
  useSensing,
  useSession,
  type SensingMode,
  type Setting,
  type SimValues,
  type Weather,
} from '@/lib/score';
import { albumInk, INK_MUTED } from '@/lib/album-ink';
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

  const { mode, liveAvailable, sim, live, location, setSim, setMode } = sensing;
  const isLive = mode === 'live';
  // The one colour on the page: the playing song's album ink, or plain ink when idle.
  const tint = session.track ? albumInk(session.track.coverColor, INK_MUTED) : undefined;
  const cadence = isLive ? Math.min(MAX_CADENCE, live.cadenceSpm) : sim.cadenceSpm;
  const hour = isLive ? live.localHour : sim.localHour;
  // With a location set, weather and setting follow it until one is picked by hand.
  const placeName = location ? (location.street ?? location.area ?? location.city ?? location.label) : null;
  const weatherNote = isLive
    ? 'Automatic'
    : placeName && sim.weatherSource === 'location'
      ? `From ${placeName}`
      : null;
  const settingNote =
    isLive && sensing.herePlace
      ? 'From a known place'
      : !isLive && placeName && sim.settingSource === 'location'
        ? `From ${placeName}`
        : null;

  // A moment is a hand-set scene, so choosing one also switches to manual.
  const applyPreset = (values: SimValues) => {
    if (isLive) setMode('simulated');
    setSim(values);
  };

  return (
    <Screen edges="none" padded={false} testID="simulator-screen">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md }]}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="sim-scroll">
        <View style={styles.header}>
          <AppText accessibilityRole="header" style={styles.headerText} variant="screenTitle">
            Set the scene
          </AppText>
          <ModeBadge mode={mode} />
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
          <AppText align="center" style={styles.hint} testID="sim-live-unavailable" tone="muted" variant="meta">
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
          placeLabel={location?.label}
          scene={sensing.scene}
          tint={tint}
        />

        <View style={styles.section}>
          <SectionHeader title="Where you are" />
          <WhereYouAre sensing={sensing} />
        </View>

        {isLive ? <LiveReadingsCard live={live} permissions={sensing.permissions} /> : null}

        <View style={styles.section}>
          <SectionHeader detail="One tap" title="Moments" />
          <PresetGrid current={isLive ? null : sim} onSelect={applyPreset} />
        </View>

        <View style={styles.section}>
          <SectionHeader detail={isLive ? 'Automatic' : undefined} title="Pace and time" />
          <Surface style={styles.sliders} variant="default">
            <LabeledSlider
              disabled={isLive}
              formatValue={formatCadenceWithPace}
              label="Pace"
              maximumLabel="Sprint"
              maximumValue={MAX_CADENCE}
              minimumLabel="Still"
              minimumValue={0}
              onValueChange={(value) => setSim({ cadenceSpm: Math.round(value) })}
              step={1}
              testID="sim-cadence-slider"
              tint={tint}
              value={cadence}
            />
            <Divider />
            <LabeledSlider
              disabled={isLive}
              formatValue={formatHourWithTimeOfDay}
              label="Time"
              maximumLabel="Midnight"
              maximumValue={24}
              minimumLabel="Midnight"
              minimumValue={0}
              onValueChange={(value) => setSim({ localHour: Math.round(value * 4) / 4 })}
              step={0.25}
              testID="sim-hour-slider"
              tint={tint}
              value={hour}
            />
          </Surface>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Weather"
            trailing={
              weatherNote ? (
                <AppText numberOfLines={1} style={styles.note} testID="sim-weather-source" tone="muted" variant="meta">
                  {weatherNote}
                </AppText>
              ) : null
            }
          />
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
          <SectionHeader detail={isLive ? 'From calendar' : undefined} title="Upcoming event" />
          <UpcomingEvent sensing={sensing} />
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="Setting"
            trailing={
              settingNote ? (
                <AppText numberOfLines={1} style={styles.note} testID="sim-setting-source" tone="muted" variant="meta">
                  {settingNote}
                </AppText>
              ) : null
            }
          />
          <OptionChips
            accessibilityLabel="Setting"
            disabled={isLive}
            onChange={(setting) => setSim({ setting })}
            options={SETTING_OPTIONS}
            testIDPrefix="sim-setting"
            value={isLive ? sensing.context.setting : sim.setting}
          />
        </View>

        <View style={styles.section}>
          <SectionHeader detail="On this phone" title="Known places" />
          <KnownPlaces sensing={sensing} />
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  headerText: {
    flex: 1,
  },
  section: {
    gap: space.md,
  },
  // A source note beside a section title: it gives way to the title.
  note: {
    flexShrink: 1,
  },
  // Sits close under the toggle it explains.
  hint: {
    marginTop: -space.md,
  },
  sliders: {
    gap: space.lg,
  },
});

import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandMark,
  Chip,
  ChoiceChips,
  CoverArt,
  CoverMosaic,
  Divider,
  EmptyState,
  EqualizerBars,
  Icon,
  IconButton,
  LabeledSlider,
  ListRow,
  LiveBadge,
  Meter,
  Notice,
  PillButton,
  PrimaryButton,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedToggle,
  Surface,
  haptics,
} from '@/components/ui';
import { colors, layout, motion, radius, space, type TextVariant } from '@/theme';

/**
 * The design kit on one page: every primitive in its main states, on real
 * cover art. This route is not in the tab bar. Open it from the Now
 * placeholder or with the deep link `consumermobilehackathon://kit`.
 *
 * It is a reference and a review surface, not a product screen. Everything
 * here is sample data.
 */

const deezerCover = (hash: string) =>
  `https://cdn-images.dzcdn.net/images/cover/${hash}/1000x1000-000000-80-0-0.jpg`;

const CUES = [
  {
    title: 'No Surprises',
    artist: 'Radiohead',
    cue: 'Rain on 4th Street',
    scene: 'slow rainy walk in the city, late night',
    reason: '77 BPM, matches your pace. Rainy and late.',
    bpm: 77,
    time: '11:42 PM',
    coverUrl: deezerCover('7a378976d3ff1b1fd7b21ee0c7f95fa5'),
  },
  {
    title: 'Kerala',
    artist: 'Bonobo',
    cue: 'First light on the ridge',
    scene: 'brisk clear walk in the park, morning',
    reason: '124 BPM, in step with you. Clear and early.',
    bpm: 124,
    time: '7:05 AM',
    coverUrl: deezerCover('803b9908e22fc5e948ad627e48fe66ee'),
  },
  {
    title: 'Texas Sun',
    artist: 'Khruangbin & Leon Bridges',
    cue: 'Golden hour, windows down',
    scene: 'easy sunny stroll through town, afternoon',
    reason: '82 BPM, unhurried. Warm and bright.',
    bpm: 82,
    time: '4:30 PM',
    coverUrl: deezerCover('ce74bca0d491ab7f24a6a21a752a1745'),
  },
  {
    title: 'Awake',
    artist: 'Tycho',
    cue: 'The long way home',
    scene: 'steady run by the water, dusk',
    reason: '90 BPM at half your stride. Cloud, cooling off.',
    bpm: 90,
    time: '6:12 PM',
    coverUrl: deezerCover('99a031579197a567b508f0d6d5aad955'),
  },
] as const;

const COVERS = CUES.map((cue) => cue.coverUrl);

const TYPE_SAMPLES: { variant: TextVariant; sample: string; italic?: boolean }[] = [
  { variant: 'displayLarge', sample: 'Rain on 4th Street' },
  { variant: 'displayLarge', sample: 'Rain on 4th Street', italic: true },
  { variant: 'displayMedium', sample: 'Today, scored' },
  { variant: 'displaySmall', sample: 'The long way home' },
  { variant: 'serifItalic', sample: 'slow rainy walk in the city, late night' },
  { variant: 'title', sample: 'No Surprises' },
  { variant: 'body', sample: 'The existing song that best fits the moment.' },
  { variant: 'label', sample: 'More energy' },
  { variant: 'caption', sample: 'Radiohead · 77 BPM' },
  { variant: 'overline', sample: 'Now scoring · Cue 07' },
  { variant: 'numeric', sample: '0:12 / 0:30' },
];

const SWATCHES: { name: string; color: string }[] = [
  { name: 'bg', color: colors.bg },
  { name: 'bgRaised', color: colors.bgRaised },
  { name: 'surface', color: colors.surface },
  { name: 'surfaceRaised', color: colors.surfaceRaised },
  { name: 'text', color: colors.text },
  { name: 'textSecondary', color: colors.textSecondary },
  { name: 'textTertiary', color: colors.textTertiary },
  { name: 'accent', color: colors.accent },
  { name: 'energy', color: colors.energy },
  { name: 'calm', color: colors.calm },
  { name: 'danger', color: colors.danger },
  { name: 'success', color: colors.success },
];

type Weather = 'clear' | 'cloud' | 'rain' | 'fog' | 'snow' | 'storm';
type Mode = 'live' | 'simulated';
type Nudge = 'calmer' | 'steady' | 'energy';

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader detail={detail} title={title} />
      {children}
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <AppText tone="tertiary" variant="caption">
      {children}
    </AppText>
  );
}

export default function KitScreen() {
  const [cueIndex, setCueIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0.24);
  const [mode, setMode] = useState<Mode>('simulated');
  const [nudge, setNudge] = useState<Nudge>('steady');
  const [weather, setWeather] = useState<Weather>('rain');
  const [cadence, setCadence] = useState(112);
  const [hour, setHour] = useState(18);
  const [noticeVisible, setNoticeVisible] = useState(true);

  const cue = CUES[cueIndex];

  // Stand-in for the audio clock, so the progress bar and the pulse can be seen moving.
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((value) => (value >= 1 ? 0 : value + 0.01));
    }, 300);
    return () => clearInterval(timer);
  }, [playing]);

  const nextCue = () => {
    setCueIndex((index) => (index + 1) % CUES.length);
    setProgress(0);
  };

  return (
    <Screen contentStyle={styles.content} coverUrl={cue.coverUrl} scroll testID="kit-screen">
      {/* Header */}
      <View style={styles.header}>
        <IconButton
          accessibilityLabel="Back"
          icon="chevron-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          size="sm"
          variant="ghost"
        />
        <View style={styles.wordmark}>
          <BrandMark size={26} />
          <AppText variant="displaySmall">Score</AppText>
        </View>
        <AppText variant="overline">Design kit</AppText>
      </View>

      {/* A composition, to judge the kit as a whole. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <LiveBadge
            active={playing}
            label={mode === 'live' ? 'Live' : 'Simulated'}
            tone={mode === 'live' ? 'accent' : 'calm'}
          />
          <AppText variant="overline">Cue 0{cueIndex + 1}</AppText>
        </View>

        <View style={styles.heroCover}>
          <CoverArt
            accessibilityLabel={`Cover of ${cue.title}`}
            bpm={cue.bpm}
            pulsing={playing}
            transitionMs={motion.duration.ambient}
            uri={cue.coverUrl}
          />
        </View>

        <View style={styles.heroText}>
          <View style={styles.nowScoring}>
            <EqualizerBars playing={playing} size={12} />
            <AppText variant="overline">{playing ? 'Now scoring' : 'Paused'}</AppText>
          </View>
          <AppText numberOfLines={2} variant="displayLarge">
            {cue.title}
          </AppText>
          <AppText numberOfLines={1} tone="secondary">
            {cue.artist}
          </AppText>
          <AppText style={styles.scene} tone="secondary" variant="serifItalic">
            {cue.scene}
          </AppText>
        </View>

        <View style={styles.wrapRow}>
          <Chip icon="walk-outline" label={`${cadence} spm`} />
          <Chip icon="rainy-outline" label="Rain · 9°" />
          <Chip icon="pulse-outline" label={`${cue.bpm} BPM`} tone="accent" />
        </View>

        <View style={styles.progress}>
          <ProgressBar value={progress} />
          <View style={styles.spread}>
            <AppText tone="tertiary" variant="numeric">
              0:{String(Math.floor(progress * 30)).padStart(2, '0')}
            </AppText>
            <AppText tone="tertiary" variant="numeric">
              0:30
            </AppText>
          </View>
        </View>

        <View style={styles.transport}>
          <IconButton
            accessibilityLabel="Calmer"
            icon="moon-outline"
            onPress={() => setNudge('calmer')}
            selected={nudge === 'calmer'}
            size="lg"
          />
          <PrimaryButton
            accessibilityLabel={playing ? 'Stop scoring' : 'Start scoring'}
            icon={playing ? 'stop' : 'play'}
            onPress={() => setPlaying((value) => !value)}
            testID="kit-transport"
            variant={playing ? 'surface' : 'accent'}
          />
          <IconButton
            accessibilityLabel="Skip this cue"
            icon="play-skip-forward"
            onPress={nextCue}
            size="lg"
            testID="kit-skip"
          />
        </View>
        <AppText align="center" tone="tertiary" variant="caption">
          {cue.reason}
        </AppText>
      </View>

      <Section detail="AppText" title="Typography">
        <View style={styles.stack}>
          {TYPE_SAMPLES.map(({ variant, sample, italic }) => (
            <View key={`${variant}${italic ? '-italic' : ''}`} style={styles.typeRow}>
              <Label>{italic ? `${variant} · italic` : variant}</Label>
              <AppText italic={italic} numberOfLines={2} variant={variant}>
                {sample}
              </AppText>
            </View>
          ))}
        </View>
      </Section>

      <Section detail="theme" title="Colour">
        <View style={styles.swatches}>
          {SWATCHES.map(({ name, color }) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.swatchChip, { backgroundColor: color }]} />
              <Label>{name}</Label>
            </View>
          ))}
        </View>
      </Section>

      <Section detail="Chip · LiveBadge" title="Status">
        <View style={styles.wrapRow}>
          <LiveBadge />
          <LiveBadge label="Simulated" tone="calm" />
          <LiveBadge active={false} label="Paused" tone="neutral" />
          <LiveBadge label="Rec" outlined={false} tone="danger" />
        </View>
        <View style={styles.wrapRow}>
          <Chip icon="walk-outline" label="112 spm" />
          <Chip icon="pulse-outline" label="96 BPM" tone="accent" />
          <Chip icon="flash-outline" label="High energy" tone="energy" />
          <Chip icon="moon-outline" label="Calm" tone="calm" />
          <Chip icon="alert-circle-outline" label="Offline" tone="danger" />
          <Chip icon="checkmark" label="Saved" tone="success" />
        </View>
        <View style={styles.wrapRow}>
          <Chip label="melancholy" size="sm" />
          <Chip label="late night" size="sm" />
          <Chip icon="rainy-outline" label="rain" size="sm" tone="calm" />
        </View>
      </Section>

      <Section detail="Bars · Progress · Meter" title="Playback">
        <View style={styles.row}>
          <EqualizerBars playing size={24} />
          <EqualizerBars bars={5} playing size={16} tone="primary" />
          <EqualizerBars bars={3} playing size={12} />
          <EqualizerBars playing={false} size={16} />
          <Label>playing ×3 · paused</Label>
        </View>
        <View style={styles.stack}>
          <ProgressBar value={progress} />
          <ProgressBar tone="accent" value={0.62} />
          <ProgressBar height={6} tone="calm" value={0.3} />
        </View>
        <Surface style={styles.meters}>
          <Meter label="Energy" style={styles.flex} tone="energy" value={cadence / 200} />
          <Meter label="Valence" style={styles.flex} tone="calm" value={0.35} valueLabel="low" />
        </Surface>
      </Section>

      <Section detail="PrimaryButton" title="Primary control">
        <PrimaryButton
          fullWidth
          icon="play"
          label="Start scoring"
          onPress={() => haptics.success()}
        />
        <PrimaryButton fullWidth icon="stop" label="Stop" variant="surface" />
        <View style={styles.wrapRowLoose}>
          <PrimaryButton icon="play" label="Start" size="md" />
          <PrimaryButton label="Loading" loading size="md" />
          <PrimaryButton disabled label="Disabled" size="md" variant="surface" />
        </View>
        <View style={styles.wrapRowLoose}>
          <PrimaryButton accessibilityLabel="Start" icon="play" />
          <PrimaryButton accessibilityLabel="Stop" icon="stop" variant="surface" />
          <PrimaryButton accessibilityLabel="Start" icon="play" size="md" />
          <PrimaryButton
            accessibilityLabel="Loading"
            icon="play"
            loading
            size="md"
            variant="surface"
          />
        </View>
      </Section>

      <Section detail="Icon · Pill" title="Secondary controls">
        <View style={styles.wrapRowLoose}>
          <IconButton accessibilityLabel="Skip" icon="play-skip-forward" size="lg" />
          <IconButton accessibilityLabel="Skip" icon="play-skip-forward" />
          <IconButton accessibilityLabel="Skip" icon="play-skip-forward" size="sm" />
          <IconButton accessibilityLabel="Share" icon="share-outline" variant="ghost" />
          <IconButton accessibilityLabel="Favourite" icon="heart" selected />
          <IconButton accessibilityLabel="Add" icon="add" variant="accent" />
          <IconButton accessibilityLabel="Disabled" disabled icon="close" />
        </View>
        <View style={styles.row}>
          <PillButton grow icon="moon-outline" label="Calmer" tone="calm" />
          <PillButton grow icon="flash-outline" label="More energy" tone="energy" />
        </View>
        <View style={styles.wrapRow}>
          <PillButton icon="share-outline" label="Share soundtrack" />
          <PillButton icon="sparkles-outline" label="New cue" tone="accent" />
          <PillButton icon="refresh" label="Retry" size="sm" />
          <PillButton icon="chevron-forward" iconPosition="trailing" label="Open" size="sm" />
          <PillButton disabled label="Disabled" size="sm" />
        </View>
      </Section>

      <Section detail="Inputs" title="Simulator controls">
        <SegmentedToggle
          accessibilityLabel="Context source"
          onChange={setMode}
          options={[
            { value: 'live', label: 'Live sensors', icon: 'radio-outline' },
            { value: 'simulated', label: 'Simulated', icon: 'options-outline' },
          ]}
          testID="kit-mode"
          value={mode}
        />
        <SegmentedToggle
          accessibilityLabel="Nudge"
          onChange={setNudge}
          options={[
            { value: 'calmer', label: 'Calmer' },
            { value: 'steady', label: 'Steady' },
            { value: 'energy', label: 'Energy' },
          ]}
          value={nudge}
        />
        <ChoiceChips
          accessibilityLabel="Weather"
          bleed={layout.screenPadding}
          onChange={setWeather}
          options={[
            { value: 'clear', label: 'Clear', icon: 'sunny-outline' },
            { value: 'cloud', label: 'Cloud', icon: 'cloud-outline' },
            { value: 'rain', label: 'Rain', icon: 'rainy-outline' },
            { value: 'fog', label: 'Fog', icon: 'reorder-three-outline' },
            { value: 'snow', label: 'Snow', icon: 'snow-outline' },
            { value: 'storm', label: 'Storm', icon: 'thunderstorm-outline' },
          ]}
          value={weather}
        />
        <Surface style={styles.sliders}>
          <LabeledSlider
            formatValue={(value) => (value === 0 ? 'Still' : `${value} spm`)}
            icon="walk-outline"
            label="Cadence"
            maximumLabel="Sprint"
            maximumValue={200}
            minimumLabel="Still"
            minimumValue={0}
            onValueChange={setCadence}
            step={1}
            testID="kit-cadence"
            value={cadence}
          />
          <Divider />
          <LabeledSlider
            formatValue={formatHour}
            icon="time-outline"
            label="Hour"
            maximumValue={23}
            minimumValue={0}
            onValueChange={setHour}
            step={1}
            tone="calm"
            value={hour}
          />
        </Surface>
      </Section>

      <Section detail="Cover · Mosaic · Avatar" title="Imagery">
        <View style={styles.wrapRowLoose}>
          <CoverArt size={96} uri={COVERS[0]} />
          <CoverArt bpm={96} glowColor="rgba(245, 168, 60, 0.45)" size={96} uri={COVERS[1]} />
          <CoverArt size={96} />
        </View>
        <Label>plain · pulsing at 96 BPM with a glow · placeholder</Label>
        <View style={styles.wrapRowLoose}>
          <CoverMosaic size={72} uris={COVERS} />
          <CoverMosaic size={72} uris={COVERS.slice(0, 3)} />
          <CoverMosaic size={72} uris={COVERS.slice(0, 2)} />
          <CoverMosaic size={72} uris={COVERS.slice(0, 1)} />
          <CoverMosaic size={72} uris={[]} />
        </View>
        <Label>mosaic of four, three, two, one, none</Label>
        <View style={styles.row}>
          <Avatar accessibilityLabel="Mina" emoji="🎧" size={56} />
          <Avatar accessibilityLabel="Jonah" emoji="🌧️" ring size={56} />
          <Avatar accessibilityLabel="Ada" emoji="🦊" />
          <Avatar accessibilityLabel="Sol" emoji="🌙" size={32} />
        </View>
      </Section>

      <Section detail="ListRow" title="Today's cues">
        <Surface padding="none" style={styles.list}>
          {CUES.map((item, index) => (
            <View key={item.title}>
              {index > 0 ? <Divider inset={52 + space.md} /> : null}
              <ListRow
                active={index === cueIndex}
                leading={<CoverArt shadow={false} size={52} uri={item.coverUrl} />}
                onPress={() => {
                  setCueIndex(index);
                  setProgress(0);
                }}
                overline={`Cue 0${index + 1} · ${item.time}`}
                subtitle={`${item.title} · ${item.artist}`}
                title={item.cue}
                titleStyle="serif"
                trailing={
                  index === cueIndex ? <EqualizerBars playing={playing} size={14} /> : undefined
                }
              />
            </View>
          ))}
        </Surface>

        <ListRow
          chevron
          leading={<Avatar emoji="🎧" size={44} />}
          onPress={() => {}}
          subtitle="12 cues · updated 6:12 PM"
          title="Mina's Sunday"
          trailing={<CoverMosaic size={44} uris={COVERS} />}
        />
        <Divider />
        <ListRow
          leading={<Icon name="location-outline" size={22} tone="secondary" />}
          subtitle="A row that cannot be pressed"
          title="Plain row"
          trailing={
            <AppText tone="tertiary" variant="numeric">
              0:30
            </AppText>
          }
        />
      </Section>

      <Section detail="Surface" title="Panels">
        <View style={styles.row}>
          <Surface padding="md" style={styles.panel}>
            <AppText variant="overline">Default</AppText>
            <AppText variant="caption">6 % white</AppText>
          </Surface>
          <Surface padding="md" style={styles.panel} variant="raised">
            <AppText variant="overline">Raised</AppText>
            <AppText variant="caption">10 % white</AppText>
          </Surface>
          <Surface padding="md" style={styles.panel} variant="accent">
            <AppText tone="accent" variant="overline">
              Accent
            </AppText>
            <AppText variant="caption">Live</AppText>
          </Surface>
        </View>
      </Section>

      <Section detail="Notice" title="Notices">
        {noticeVisible ? (
          <Notice
            message="No step sensor on this device. Using simulated values."
            onDismiss={() => setNoticeVisible(false)}
          />
        ) : null}
        <Notice
          actionLabel="Retry"
          message="Check your connection and try again."
          onAction={() => setNoticeVisible(true)}
          title="Could not reach Score"
          tone="error"
        />
        <Notice
          message="Weather is unknown here, so the scene uses time and pace only."
          tone="warning"
        />
        <Notice message="Soundtrack card saved to your photos." tone="success" />
      </Section>

      <Section detail="EmptyState" title="Empty">
        <Surface padding="none">
          <EmptyState
            actionIcon="play"
            actionLabel="Start scoring"
            fill={false}
            icon="film-outline"
            message="Start scoring on the Now tab and today's cues will collect here."
            onAction={() => setPlaying(true)}
            overline="Original soundtrack"
            title="Nothing scored yet"
          />
        </Surface>
      </Section>

      <View style={styles.footer}>
        <BrandMark size={36} />
        <AppText align="center" italic tone="secondary" variant="displaySmall">
          Your day is the movie.
        </AppText>
        <AppText variant="overline">Score · design kit</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.xxl + space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: -space.sm,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  hero: {
    gap: space.xl,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCover: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 300,
  },
  heroText: {
    gap: space.xs,
  },
  nowScoring: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.xs,
  },
  scene: {
    marginTop: space.sm,
  },
  progress: {
    gap: space.sm,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
  },
  section: {
    gap: space.lg,
  },
  stack: {
    gap: space.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.sm,
  },
  wrapRowLoose: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
  },
  flex: {
    flex: 1,
  },
  panel: {
    flex: 1,
    gap: space.xs,
  },
  typeRow: {
    gap: space.xs,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.lg,
  },
  swatch: {
    width: '25%',
    alignItems: 'center',
    gap: space.sm,
  },
  swatchChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
  },
  meters: {
    flexDirection: 'row',
    gap: space.xl,
  },
  sliders: {
    gap: space.lg,
  },
  list: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  footer: {
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.xl,
  },
});

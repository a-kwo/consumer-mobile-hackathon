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
} from '@/components/ui';
import { colors, layout, motion, sizes, space, type TextVariant } from '@/theme';

/**
 * The design kit on one page: paper, ink, the two typefaces and every
 * primitive in its main states. This route is not in the tab bar; open it
 * with the deep link `consumermobilehackathon://kit`.
 *
 * It is a reference and a review surface, not a product screen. Everything
 * here is sample data, including the album inks, which the app computes from
 * each cover.
 */

const deezerCover = (hash: string) =>
  `https://cdn-images.dzcdn.net/images/cover/${hash}/1000x1000-000000-80-0-0.jpg`;

const CUES = [
  {
    title: 'No Surprises',
    artist: 'Radiohead',
    entry: 'Rain on 4th Street',
    scene: 'A slow rainy walk, late at night',
    reason: 'Its tempo matches your pace, and it is as quiet as the street.',
    albumInk: '#35478C',
    coverUrl: deezerCover('7a378976d3ff1b1fd7b21ee0c7f95fa5'),
  },
  {
    title: 'Kerala',
    artist: 'Bonobo',
    entry: 'First light on the ridge',
    scene: 'A brisk clear walk in the park, in the morning',
    reason: 'In step with you at 124 beats a minute, bright like the sky.',
    albumInk: '#216A82',
    coverUrl: deezerCover('803b9908e22fc5e948ad627e48fe66ee'),
  },
  {
    title: 'Texas Sun',
    artist: 'Khruangbin & Leon Bridges',
    entry: 'Golden hour, windows down',
    scene: 'An easy sunny stroll through town, in the afternoon',
    reason: 'Unhurried and warm, for a slow walk in the sun.',
    albumInk: '#A3672A',
    coverUrl: deezerCover('ce74bca0d491ab7f24a6a21a752a1745'),
  },
  {
    title: 'Awake',
    artist: 'Tycho',
    entry: 'The long way home',
    scene: 'A steady run by the water, at dusk',
    reason: 'Half the tempo of your stride, cooling off as the light goes.',
    albumInk: '#964134',
    coverUrl: deezerCover('99a031579197a567b508f0d6d5aad955'),
  },
] as const;

const COVERS = CUES.map((cue) => cue.coverUrl);

const TYPE_ROLES: { variant: TextVariant; spec: string; sample: string }[] = [
  { variant: 'wordmark', spec: 'Fraunces 500 · 22', sample: 'Score' },
  { variant: 'songTitle', spec: 'Fraunces 500 · 34 / 40', sample: 'No Surprises' },
  { variant: 'screenTitle', spec: 'Fraunces 500 · 30 / 34', sample: "Today's soundtrack" },
  { variant: 'entryTitle', spec: 'Fraunces 400 · 17 / 22', sample: 'Rain on 4th Street' },
  {
    variant: 'sceneLine',
    spec: 'Fraunces italic · 16 / 20',
    sample: 'A slow rainy walk, late at night',
  },
  { variant: 'artist', spec: 'Hanken Grotesk 400 · 16 / 22', sample: 'Radiohead' },
  {
    variant: 'body',
    spec: 'Hanken Grotesk 400 · 15 / 22',
    sample: 'Its tempo matches your pace, and it is as quiet as the street.',
  },
  { variant: 'button', spec: 'Hanken Grotesk 500 · 14', sample: 'More energy' },
  { variant: 'meta', spec: 'Hanken Grotesk 400 · 13 / 20', sample: '92 steps/min · Rain' },
  { variant: 'time', spec: 'Hanken Grotesk 400 · 12 / 16, tabular', sample: '0:12' },
];

const SWATCHES: { name: string; color: string }[] = [
  { name: 'paper', color: colors.paper },
  { name: 'paperRaised', color: colors.paperRaised },
  { name: 'paperSunk', color: colors.paperSunk },
  { name: 'hairline', color: colors.hairline },
  { name: 'ink', color: colors.ink },
  { name: 'inkSoft', color: colors.inkSoft },
  { name: 'inkMuted', color: colors.inkMuted },
];

type Weather = 'clear' | 'cloud' | 'rain' | 'fog' | 'snow' | 'storm';
type Source = 'live' | 'manual';

function formatHour(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader rule title={title} />
      {children}
    </View>
  );
}

export default function KitScreen() {
  const [cueIndex, setCueIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0.4);
  const [source, setSource] = useState<Source>('live');
  const [weather, setWeather] = useState<Weather>('rain');
  const [cadence, setCadence] = useState(92);
  const [hour, setHour] = useState(23);
  const [noticeVisible, setNoticeVisible] = useState(true);

  const cue = CUES[cueIndex];

  // Stand-in for the audio clock, so the progress bar can be seen moving.
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
    <Screen contentStyle={styles.content} scroll testID="kit-screen">
      {/* Header: the wordmark and where the context comes from. */}
      <View style={styles.header}>
        <View style={styles.wordmark}>
          <BrandMark size={24} />
          <AppText variant="wordmark">Score</AppText>
        </View>
        <LiveBadge label={source === 'live' ? 'Live sensors' : 'Set by hand'} />
      </View>

      {/* A composition in the order of the Now screen, to judge the kit as a whole. */}
      <View style={styles.now}>
        <View style={styles.cover}>
          <CoverArt
            accessibilityLabel={`Cover of ${cue.title}`}
            transitionMs={motion.duration.ambient}
            uri={cue.coverUrl}
          />
        </View>

        <View style={styles.titles}>
          <AppText variant="sceneLine">{cue.scene}</AppText>
          <AppText numberOfLines={2} style={styles.songTitle} variant="songTitle">
            {cue.title}
          </AppText>
          <AppText numberOfLines={1} variant="artist">
            {cue.artist}
          </AppText>
          <AppText style={styles.reason} tone="soft">
            {cue.reason}
          </AppText>
        </View>

        <View style={styles.progress}>
          <ProgressBar tint={cue.albumInk} value={progress} />
          <View style={styles.spread}>
            <AppText variant="time">0:{String(Math.floor(progress * 30)).padStart(2, '0')}</AppText>
            <AppText variant="time">{playing ? 'Playing' : 'Paused'}</AppText>
            <AppText variant="time">0:30</AppText>
          </View>
        </View>

        <View style={styles.controls}>
          <PillButton grow label="Calmer" />
          <PrimaryButton
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            icon={playing ? 'pause' : 'play'}
            onPress={() => setPlaying((value) => !value)}
            testID="kit-transport"
          />
          <IconButton
            accessibilityLabel="Skip this song"
            icon="play-skip-forward"
            onPress={nextCue}
            testID="kit-skip"
          />
          <PillButton grow label="More energy" />
        </View>

        <AppText align="center" variant="meta">
          {cadence} steps/min · Rain
        </AppText>
      </View>

      <Section title="Type">
        <View style={styles.stack}>
          {TYPE_ROLES.map(({ variant, spec, sample }) => (
            <View key={variant} style={styles.typeRow}>
              <AppText variant="meta">
                {variant} · {spec}
              </AppText>
              <AppText tone="primary" variant={variant}>
                {sample}
              </AppText>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Colour">
        <View style={styles.swatches}>
          {SWATCHES.map(({ name, color }) => (
            <View key={name} style={styles.swatch}>
              <View style={[styles.swatchChip, { backgroundColor: color }]} />
              <AppText variant="meta">{name}</AppText>
            </View>
          ))}
        </View>
        <AppText variant="meta">
          Album ink, one per song, for graphics only. Tap a swatch to change the song.
        </AppText>
        <View style={styles.row}>
          {CUES.map((item, index) => (
            <IconButton
              accessibilityLabel={`Album ink of ${item.title}`}
              icon={index === cueIndex ? 'checkmark' : 'ellipse'}
              key={item.title}
              onPress={() => setCueIndex(index)}
              size="sm"
              style={[styles.inkSwatch, { backgroundColor: item.albumInk }]}
              variant="ghost"
            />
          ))}
        </View>
      </Section>

      <Section title="Playback">
        <View style={styles.stack}>
          <ProgressBar tint={cue.albumInk} value={progress} />
          <ProgressBar value={0.62} />
        </View>
        <View style={styles.row}>
          <EqualizerBars playing tint={cue.albumInk} />
          <EqualizerBars playing />
          <EqualizerBars playing={false} />
          <AppText variant="meta">Album ink, ink, paused</AppText>
        </View>
        <Meter label="Energy" tint={cue.albumInk} value={cadence / 200} />
      </Section>

      <Section title="Buttons">
        <View style={styles.wrap}>
          <PrimaryButton accessibilityLabel="Play" icon="play" />
          <PrimaryButton accessibilityLabel="Pause" icon="pause" />
          <IconButton accessibilityLabel="Skip" icon="play-skip-forward" />
          <IconButton accessibilityLabel="Replay" icon="play" size="sm" />
          <IconButton accessibilityLabel="Close" icon="close" size="sm" variant="ghost" />
          <IconButton accessibilityLabel="Disabled" disabled icon="play-skip-forward" />
        </View>
        <View style={styles.row}>
          <PillButton grow label="Calmer" />
          <PillButton grow label="More energy" />
        </View>
        <View style={styles.wrap}>
          <PrimaryButton label="Share" />
          <PrimaryButton label="Saving" loading />
          <PrimaryButton label="Later" variant="surface" />
          <PrimaryButton disabled label="Disabled" />
        </View>
        <View style={styles.wrap}>
          <PillButton icon="refresh" label="Retry" size="sm" />
          <PillButton label="Remove" size="sm" tone="danger" />
          <PillButton disabled label="Disabled" size="sm" />
        </View>
        <PrimaryButton fullWidth label="Start scoring" size="lg" />
      </Section>

      <Section title="Scene controls">
        <SegmentedToggle
          accessibilityLabel="Where the scene comes from"
          onChange={setSource}
          options={[
            { value: 'live', label: 'Live sensors' },
            { value: 'manual', label: 'Set by hand' },
          ]}
          testID="kit-source"
          value={source}
        />
        <ChoiceChips
          accessibilityLabel="Weather"
          bleed={layout.screenPadding}
          onChange={setWeather}
          options={[
            { value: 'clear', label: 'Clear' },
            { value: 'cloud', label: 'Cloud' },
            { value: 'rain', label: 'Rain' },
            { value: 'fog', label: 'Fog' },
            { value: 'snow', label: 'Snow' },
            { value: 'storm', label: 'Storm' },
          ]}
          value={weather}
        />
        <LabeledSlider
          formatValue={(value) => (value === 0 ? 'Still' : `${value} steps/min`)}
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
        <LabeledSlider
          formatValue={formatHour}
          label="Hour"
          maximumValue={23}
          minimumValue={0}
          onValueChange={setHour}
          step={1}
          tint={cue.albumInk}
          value={hour}
        />
      </Section>

      {/* The soundtrack header and tracklist, as the plan lays them out. */}
      <View style={styles.section}>
        <View style={styles.ostHeader}>
          <CoverMosaic shadow size={sizes.soundtrackCover} uris={COVERS} />
          <View style={styles.ostText}>
            <AppText variant="screenTitle">Today&apos;s soundtrack</AppText>
            <AppText variant="meta">{CUES.length} songs</AppText>
            <PrimaryButton label="Share" style={styles.share} />
          </View>
        </View>
        <View>
          {CUES.map((item, index) => (
            <View key={item.title}>
              <Divider />
              <ListRow
                active={index === cueIndex}
                leading={<CoverArt size={sizes.thumb} uri={item.coverUrl} />}
                subtitle={`${item.title} · ${item.artist}`}
                title={item.entry}
                titleStyle="serif"
                trailing={
                  index === cueIndex ? (
                    <EqualizerBars playing={playing} size={14} tint={item.albumInk} />
                  ) : (
                    <IconButton
                      accessibilityLabel={`Replay ${item.title}`}
                      icon="play"
                      onPress={() => {
                        setCueIndex(index);
                        setProgress(0);
                      }}
                      size="sm"
                    />
                  )
                }
              />
            </View>
          ))}
          <Divider />
        </View>
      </View>

      <Section title="People and covers">
        <ListRow
          chevron
          leading={<Avatar emoji="🎧" size={sizes.thumb} />}
          onPress={() => {}}
          subtitle="12 songs · updated 6:12 pm"
          title="Mina's Sunday"
          trailing={<CoverMosaic size={sizes.thumb} uris={COVERS} />}
        />
        <View style={styles.wrap}>
          <CoverArt size={96} uri={COVERS[1]} />
          <CoverArt size={96} />
          <CoverMosaic size={64} uris={COVERS.slice(0, 3)} />
          <CoverMosaic size={64} uris={COVERS.slice(0, 2)} />
          <CoverArt size={sizes.thumb} uri={COVERS[2]} />
          <Avatar emoji="🌧️" ring />
          <Avatar emoji="🦊" />
        </View>
        <View style={styles.wrap}>
          <Chip label="Rain" />
          <Chip icon="walk-outline" label="92 steps/min" />
          <Chip label="Late night" size="sm" />
          <Chip label="Offline" tone="danger" />
        </View>
      </Section>

      <Section title="Notices">
        {noticeVisible ? (
          <Notice
            message="No step sensor on this device. Set the scene by hand."
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
        <Notice message="Soundtrack card saved to your photos." tone="success" />
        <Surface>
          <AppText variant="title">A panel</AppText>
          <AppText variant="meta">paperRaised, radius 14, for things that are grouped.</AppText>
        </Surface>
      </Section>

      <Section title="Empty">
        <EmptyState
          actionLabel="Start scoring"
          fill={false}
          icon="musical-notes-outline"
          message="Start on the Now tab and today's songs will collect here."
          onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          title="Nothing scored yet"
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  now: {
    gap: space.xl,
  },
  cover: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: sizes.cover,
    marginVertical: space.lg,
  },
  titles: {
    gap: space.xs,
  },
  songTitle: {
    marginTop: space.xs,
  },
  reason: {
    marginTop: space.sm,
    color: colors.inkSoft,
  },
  progress: {
    gap: space.sm,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.md,
  },
  typeRow: {
    gap: space.xxs,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.lg,
  },
  swatch: {
    width: '25%',
    alignItems: 'center',
    gap: space.xs,
  },
  swatchChip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
  },
  inkSwatch: {
    borderRadius: 18,
  },
  ostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  ostText: {
    flex: 1,
    gap: space.xs,
  },
  share: {
    marginTop: space.sm,
    justifyContent: 'flex-start',
  },
});

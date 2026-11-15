import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FigureStats } from '@/components/figure/cymatic-figure';
import { figureTuning } from '@/components/figure/figure-tuning';
import { NowCover } from '@/components/figure/now-cover';
import { albumInk, INK_MUTED } from '@/lib/album-ink';

/**
 * Figure lab: a test surface for the cymatic figure, not a product screen.
 * It is not in the tab bar. Open it with the deep link
 * `consumermobilehackathon://figure-lab`.
 *
 * Three presets cover the range of the figure, a toggle pauses it, and the
 * readout shows the measured UI-thread frame rate and how many grains the
 * figure is currently drawing (it drops grains if frames are slow).
 */

const COVER =
  'https://cdn-images.dzcdn.net/images/cover/7a378976d3ff1b1fd7b21ee0c7f95fa5/500x500-000000-80-0-0.jpg';

const PAPER = '#F4EDE1';
const PAPER_SUNK = '#EAE1D2';
const INK = '#2B2420';

type PresetKey = 'calm' | 'mid' | 'high';

const PRESETS: Record<PresetKey, { label: string; energy: number; bpm: number; color: string }> = {
  calm: { label: 'Calm', energy: 0.2, bpm: 70, color: '#F2D675' },
  mid: { label: 'Mid', energy: 0.55, bpm: 110, color: '#C8432B' },
  high: { label: 'High', energy: 0.9, bpm: 165, color: '#2F6FD6' },
};

const PRESET_KEYS: PresetKey[] = ['calm', 'mid', 'high'];

export default function FigureLab() {
  const insets = useSafeAreaInsets();
  const [presetKey, setPresetKey] = useState<PresetKey>('mid');
  const [playing, setPlaying] = useState(true);
  const [showCover, setShowCover] = useState(true);
  const [stats, setStats] = useState<FigureStats | null>(null);

  const preset = PRESETS[presetKey];
  const ink = albumInk(preset.color, INK_MUTED);

  const readout =
    stats === null
      ? 'Frame rate: waiting for the first second'
      : stats.running
        ? `${stats.fps.toFixed(1)} fps · ${stats.grains} of ${figureTuning.grains} grains · ` +
          `step ${stats.workMs.toFixed(1)} ms${stats.stride > 1 ? ' · every 2nd frame' : ''}`
        : 'Frame loop stopped';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.title}>Figure lab</Text>
      <Text style={styles.readout} testID="figure-lab-fps">
        {readout}
      </Text>

      <NowCover
        bpm={preset.bpm}
        coverColor={preset.color}
        coverUrl={showCover ? COVER : null}
        energy={preset.energy}
        onStats={setStats}
        playing={playing}
        trackId={presetKey}
      />

      <Text style={styles.meta}>
        {`Energy ${preset.energy} · ${preset.bpm} BPM · cover ${preset.color} → ink ${ink}`}
      </Text>
      <View style={[styles.swatch, { backgroundColor: ink }]} />

      <View style={styles.row}>
        {PRESET_KEYS.map((key) => {
          const selected = key === presetKey;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={key}
              onPress={() => setPresetKey(key)}
              style={[styles.button, selected && styles.buttonSelected]}
              testID={`figure-lab-${key}`}>
              <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>
                {PRESETS[key].label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPlaying((value) => !value)}
          style={[styles.button, styles.buttonSelected]}
          testID="figure-lab-play">
          <Text style={[styles.buttonText, styles.buttonTextSelected]}>
            {playing ? 'Pause' : 'Play'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowCover((value) => !value)}
          style={styles.button}
          testID="figure-lab-cover">
          <Text style={styles.buttonText}>{showCover ? 'Hide cover' : 'Show cover'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: PAPER,
  },
  title: {
    color: INK,
    fontSize: 22,
    fontWeight: '500',
  },
  readout: {
    marginTop: 4,
    color: INK_MUTED,
    fontSize: 13,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    paddingHorizontal: 24,
    color: INK_MUTED,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  swatch: {
    width: 120,
    height: 2,
    marginTop: 8,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PAPER_SUNK,
  },
  buttonSelected: {
    backgroundColor: INK,
  },
  buttonText: {
    color: INK,
    fontSize: 14,
    fontWeight: '500',
  },
  buttonTextSelected: {
    color: PAPER,
  },
});

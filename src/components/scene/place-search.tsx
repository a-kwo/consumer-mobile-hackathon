import { Fragment, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Divider, PillButton, PressableScale } from '@/components/ui';
import type { PlaceResult, SensingApi, Setting } from '@/lib/score';
import { colors, radius, sizes, space, typography } from '@/theme';

const DEBOUNCE_MS = 400;
const MIN_QUERY = 2;
const MAX_RESULTS = 5;

/** The kind of place in a word, from the setting the search inferred. */
const KIND_WORD: Record<Setting, string | null> = {
  any: null,
  city: 'City street',
  nature: 'Park',
  indoors: 'Indoors',
  transit: 'Station',
  gym: 'Gym',
};

type Props = {
  sensing: SensingApi;
};

/**
 * Find a place by name and score as if you were there. Part of the
 * presenter's sheet only: in ordinary use the phone finds the place itself.
 *
 * testIDs: `scene-place-label`, `scene-place-search`, `scene-place-result-<n>`
 * (from 1), `scene-place-no-results`, `scene-place-clear`.
 */
export function PlaceSearch({ sensing }: Props) {
  const { location, searchPlaces, chooseLocation, clearLocation } = sensing;

  const [query, setQuery] = useState('');
  /** Null until a search has answered for the text in the field. */
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Counts searches, so an answer that arrives after a newer one was asked is ignored. */
  const latest = useRef(0);

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (timer.current) clearTimeout(timer.current);
    const request = ++latest.current;
    const wanted = text.trim();
    if (wanted.length < MIN_QUERY) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      void searchPlaces(wanted).then((found) => {
        if (request !== latest.current) return;
        setResults(found.slice(0, MAX_RESULTS));
        setSearching(false);
      });
    }, DEBOUNCE_MS);
  };

  const onChoose = (place: PlaceResult) => {
    chooseLocation(place);
    if (timer.current) clearTimeout(timer.current);
    latest.current += 1;
    setQuery('');
    setResults(null);
    setSearching(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.root}>
      <View style={styles.current}>
        <AppText numberOfLines={1} style={styles.currentLabel} testID="scene-place-label" variant="body">
          {location ? location.label : 'The place this device finds'}
        </AppText>
        {location?.source === 'chosen' ? (
          <PillButton
            accessibilityLabel="Clear the chosen place"
            label="Clear"
            onPress={clearLocation}
            size="sm"
            testID="scene-place-clear"
          />
        ) : null}
      </View>
      <TextInput
        accessibilityLabel="Search a place"
        autoCapitalize="words"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChangeQuery}
        placeholder="Search a place"
        placeholderTextColor={colors.inkMuted}
        returnKeyType="search"
        selectionColor={colors.ink}
        style={styles.input}
        testID="scene-place-search"
        value={query}
      />
      {searching && results === null ? (
        <AppText tone="muted" variant="meta">
          Searching…
        </AppText>
      ) : null}
      {results !== null && results.length === 0 ? (
        <AppText testID="scene-place-no-results" tone="muted" variant="meta">
          No places found for that. Try a street and a city.
        </AppText>
      ) : null}
      {results !== null && results.length > 0 ? (
        <View testID="scene-place-results">
          {results.map((place, index) => {
            const kind = KIND_WORD[place.setting];
            return (
              <Fragment key={`${place.label}-${place.lat}-${place.lon}`}>
                {index > 0 ? <Divider /> : null}
                <PressableScale
                  accessibilityLabel={kind ? `${place.label}, ${kind}` : place.label}
                  containerStyle={styles.resultContainer}
                  fill
                  haptic="select"
                  onPress={() => onChoose(place)}
                  pressedOpacity={0.6}
                  scaleTo={1}
                  style={styles.result}
                  testID={`scene-place-result-${index + 1}`}>
                  <AppText numberOfLines={2} style={styles.resultLabel} variant="body">
                    {place.label}
                  </AppText>
                  {kind ? (
                    <AppText numberOfLines={1} tone="muted" variant="meta">
                      {kind}
                    </AppText>
                  ) : null}
                </PressableScale>
              </Fragment>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 36,
  },
  currentLabel: {
    flex: 1,
  },
  input: {
    ...typography.body,
    // A single line: the line height of running text would push the caret off centre.
    lineHeight: undefined,
    height: sizes.control,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
    color: colors.ink,
    // No browser focus ring on web; the caret shows focus.
    outlineWidth: 0,
  },
  resultContainer: {
    alignSelf: 'stretch',
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    minHeight: 48,
    paddingVertical: space.sm,
  },
  resultLabel: {
    flex: 1,
  },
});

import { Fragment, useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Divider, PillButton, PressableScale, Surface } from '@/components/ui';
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

const STATUS_MESSAGE = {
  denied: 'Location access is off. Turn it on in Settings, or search for a place.',
  unavailable: 'This device cannot find its location. Search for a place instead.',
  error: 'Couldn’t find where you are just now. Try again, or search for a place.',
} as const;

type Props = {
  sensing: SensingApi;
};

/**
 * Where you are: the place Score is scoring for, by name ("5th Avenue, New
 * York"), with the ways to set it. "Use my location" asks the device once; the
 * search field finds a place by name and the result that is tapped becomes the
 * location. In automatic mode the device's own position wins, so the search is
 * hidden there.
 *
 * testIDs: `sim-location`, `sim-location-label`, `sim-location-source`,
 * `sim-locate`, `sim-location-status`, `sim-place-search`,
 * `sim-place-result-<n>` (from 1), `sim-place-no-results`, `sim-location-clear`.
 */
export function WhereYouAre({ sensing }: Props) {
  const { mode, location, locationStatus, locateDevice, searchPlaces, chooseLocation, clearLocation } =
    sensing;
  const isLive = mode === 'live';
  const locating = locationStatus === 'locating';

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

  const resetSearch = () => {
    if (timer.current) clearTimeout(timer.current);
    latest.current += 1;
    setQuery('');
    setResults(null);
    setSearching(false);
  };

  const onChoose = (place: PlaceResult) => {
    chooseLocation(place);
    resetSearch();
    Keyboard.dismiss();
  };

  const failure =
    locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'error'
      ? STATUS_MESSAGE[locationStatus]
      : null;

  return (
    <View style={styles.root} testID="sim-location">
      <Surface style={styles.card}>
        <AppText
          accessibilityRole="header"
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          numberOfLines={2}
          testID="sim-location-label"
          tone={location ? 'primary' : 'muted'}
          variant="wordmark">
          {location ? location.label : 'No location yet'}
        </AppText>
        <AppText testID="sim-location-source" tone="muted" variant="meta">
          {location
            ? location.source === 'device'
              ? 'From this device'
              : 'Chosen by you'
            : isLive
              ? 'Score names the place once your phone has found it.'
              : 'Use your location or search for a place, and the weather and setting follow it.'}
        </AppText>
        <View style={styles.actions}>
          <PillButton
            accessibilityLabel="Use my location"
            disabled={locating}
            icon="navigate-outline"
            label={locating ? 'Locating…' : 'Use my location'}
            onPress={locateDevice}
            size="sm"
            testID="sim-locate"
          />
          {location && !isLive ? (
            <PillButton
              accessibilityLabel="Clear the location"
              label="Clear"
              onPress={clearLocation}
              size="sm"
              testID="sim-location-clear"
            />
          ) : null}
        </View>
        {failure ? (
          <AppText accessibilityLiveRegion="polite" testID="sim-location-status" tone="soft" variant="meta">
            {failure}
          </AppText>
        ) : null}
      </Surface>

      {isLive ? null : (
        <>
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
            testID="sim-place-search"
            value={query}
          />
          {searching && results === null ? (
            <AppText testID="sim-place-searching" tone="muted" variant="meta">
              Searching…
            </AppText>
          ) : null}
          {results !== null && results.length === 0 ? (
            <AppText testID="sim-place-no-results" tone="muted" variant="meta">
              No places found for that. Try a street and a city.
            </AppText>
          ) : null}
          {results !== null && results.length > 0 ? (
            <Surface padding="none" style={styles.results} testID="sim-place-results">
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
                      testID={`sim-place-result-${index + 1}`}>
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
            </Surface>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  card: {
    gap: space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
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
  },
  results: {
    paddingHorizontal: space.lg,
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

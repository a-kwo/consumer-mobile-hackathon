import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Divider, IconButton, ListRow, Notice, PillButton, Surface } from '@/components/ui';
import { PLACE_META, SETTING_META } from '@/components/now/format';
import type { PlaceKind, SensingApi } from '@/lib/score';
import { space } from '@/theme';

import { PLACE_KINDS, PLACE_SETTING } from '@/lib/sensing/places';

type Props = {
  sensing: SensingApi;
};

function settingLine(kind: PlaceKind): string {
  return `Scored as ${SETTING_META[PLACE_SETTING[kind]].label.toLowerCase()}`;
}

/**
 * Known places: tag where the phone is now as home, the gym, a park, the
 * commute or the city, and live picks made there take that setting. The list
 * stays on the phone. testIDs: `sim-place-tag-<kind>`, `sim-place-row-<n>`,
 * `sim-place-remove-<n>`.
 */
export function KnownPlaces({ sensing }: Props) {
  const { places, herePlace, isSavingPlace, placeNotice, savePlace, removePlace } = sensing;

  return (
    <View style={styles.root}>
      <View style={styles.tags}>
        {PLACE_KINDS.map((kind) => (
          <PillButton
            accessibilityLabel={`Tag this spot as ${PLACE_META[kind].label}`}
            disabled={isSavingPlace}
            haptic="select"
            icon={PLACE_META[kind].icon}
            key={kind}
            label={PLACE_META[kind].label}
            onPress={() => savePlace(kind)}
            size="sm"
            testID={`sim-place-tag-${kind}`}
          />
        ))}
      </View>
      {placeNotice ? <Notice message={placeNotice} testID="sim-place-notice" tone="warning" /> : null}
      {places.length === 0 ? (
        <AppText testID="sim-places-empty" tone="tertiary" variant="caption">
          {isSavingPlace
            ? 'Finding where you are…'
            : 'No known places yet. Tag this spot and live cues picked here take its setting. Places stay on this phone.'}
        </AppText>
      ) : (
        <Surface padding="md" style={styles.list} testID="sim-places-list">
          {places.map((place, index) => (
            <Fragment key={place.id}>
              {index > 0 ? <Divider /> : null}
              <ListRow
                overline={place.id === herePlace?.id ? 'You are here' : undefined}
                subtitle={settingLine(place.kind)}
                testID={`sim-place-row-${index + 1}`}
                title={PLACE_META[place.kind].label}
                trailing={
                  <IconButton
                    accessibilityLabel={`Remove ${PLACE_META[place.kind].label}`}
                    icon="close"
                    onPress={() => removePlace(place.id)}
                    size="sm"
                    testID={`sim-place-remove-${index + 1}`}
                    variant="ghost"
                  />
                }
              />
            </Fragment>
          ))}
        </Surface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  list: {
    paddingVertical: space.xs,
  },
});

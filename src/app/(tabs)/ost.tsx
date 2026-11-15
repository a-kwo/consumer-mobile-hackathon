import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, TextInput, View } from 'react-native';

import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import { useOstEditing } from '@/components/ost/editing';
import {
  addDays,
  cueCount,
  cueNumber,
  dayKey,
  formatLongDate,
  mosaicCovers,
  relativeDayLabel,
  startOfLocalDay,
  toReplayItems,
} from '@/components/ost/format';
import { LeadPhoto } from '@/components/ost/lead-photo';
import { PhotoStrip } from '@/components/ost/photo-strip';
import { useOst, type OstPhoto } from '@/components/ost/queries';
import { TracklistSkeleton } from '@/components/ost/tracklist-skeleton';
import { useMinuteClock } from '@/components/ost/use-clock';
import { TabBarProbe, useReplayBarListInset } from '@/components/replay';
import {
  AppText,
  CoverMosaic,
  Divider,
  EmptyState,
  IconButton,
  LiveBadge,
  Notice,
  PillButton,
  Screen,
  SectionHeader,
  SegmentedToggle,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay, useSession, type OstEntry } from '@/lib/score';
import { colors, layout, radius, space, typography } from '@/theme';

import { TUNING } from '../../../convex/tuning';

const NO_ENTRIES: OstEntry[] = [];
const NO_PHOTOS: OstPhoto[] = [];

/** The Soundtrack tab: one day as an album, with its cues as the tracklist. */
export default function SoundtrackScreen() {
  const { deviceId } = useProfile();
  const replay = useReplay();
  const session = useSession();
  const insets = useScreenInsets();
  const replayInset = useReplayBarListInset();

  // 0 is today, -1 yesterday, and so on. Never positive.
  const [dayOffset, setDayOffset] = useState(0);
  const today = startOfLocalDay(useMinuteClock());
  const dayStart = addDays(today, dayOffset);
  const dayEnd = addDays(dayStart, 1);
  const isToday = dayOffset === 0;

  const ost = useOst(deviceId, dayStart, dayEnd);
  const loading = ost === undefined;
  const entries = ost?.entries ?? NO_ENTRIES;
  const covers = mosaicCovers(entries);
  const listId = `ost:${dayKey(dayStart)}`;
  const replayingHere = replay.listId === listId;
  const scoringLive = isToday && session.status !== 'idle';

  // Everything below is absent until the day has been edited once, and on a
  // backend from before sharing: then the day is untitled, visible and photoless.
  const photos = ost?.photos ?? NO_PHOTOS;
  const title = ost?.title;
  const isPrivate = ost?.visibility === 'private';
  const hidePlaces = ost?.hideLocations ?? false;
  const editing = useOstEditing(deviceId, dayStart);
  // A photo that will not load gives the cover back to the mosaic.
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const leadPhoto = photos.length > 0 && photos[0].url !== failedPhoto ? photos[0].url : null;
  // Null while the title is not being edited.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);

  const goToDay = (offset: number) => {
    setDayOffset(Math.min(0, offset));
    setDraftTitle(null);
    editing.dismissNotice();
  };

  const saveTitle = async () => {
    if (draftTitle === null) return;
    if (draftTitle.trim() === (title ?? '') || (await editing.rename(draftTitle))) setDraftTitle(null);
  };

  const confirmRemovePhoto = (key: string) => {
    const photo = photos.find((candidate) => candidate.photoId === key);
    if (!photo) return;
    // The browser has no native alert sheet, so there the tap removes at once.
    if (Platform.OS === 'web') {
      void editing.removePhoto(photo.photoId);
      return;
    }
    Alert.alert('Remove this photo?', 'It comes off the soundtrack for good.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void editing.removePhoto(photo.photoId) },
    ]);
  };

  // The replay plays a snapshot of the list taken when it started, and the live
  // list can shift under it (the oldest cue drops off), so the playing row is
  // matched on the item itself, never on its index.
  const isReplaying = (entry: OstEntry) =>
    replayingHere &&
    replay.item?.deezerId === entry.deezerId &&
    replay.item?.subtitle === entry.title;

  const onRowPress = (index: number) => {
    if (isReplaying(entries[index])) {
      replay.stop();
    } else {
      replay.play(listId, toReplayItems(entries), index);
    }
  };

  const rowState = (entry: OstEntry): CueRowState => {
    if (!isReplaying(entry)) return 'idle';
    return replay.status === 'loading' ? 'loading' : 'playing';
  };

  let statusLine = 'Gathering the day’s cues…';
  if (!loading) {
    if (entries.length === 0) statusLine = isToday ? 'No cues yet today' : 'No cues this day';
    else statusLine = ost.summary ? `${cueCount(entries.length)} · ${ost.summary}` : cueCount(entries.length);
  }

  const controls =
    entries.length > 0 ? (
      <View style={styles.controls}>
        {draftTitle !== null ? (
          <View style={styles.titleEdit}>
            <TextInput
              accessibilityLabel="Soundtrack title"
              autoCapitalize="sentences"
              autoFocus
              keyboardAppearance="dark"
              maxLength={TUNING.share.maxTitleChars}
              onChangeText={setDraftTitle}
              onSubmitEditing={saveTitle}
              placeholder={formatLongDate(dayStart)}
              placeholderTextColor={colors.textDisabled}
              returnKeyType="done"
              selectionColor={colors.accent}
              style={styles.titleInput}
              testID="ost-title-input"
              value={draftTitle}
            />
            <IconButton
              accessibilityLabel="Save the title"
              disabled={editing.busy !== null}
              icon="checkmark"
              onPress={saveTitle}
              testID="ost-title-save"
              variant="accent"
            />
            <IconButton
              accessibilityLabel="Cancel"
              icon="close"
              onPress={() => setDraftTitle(null)}
              testID="ost-title-cancel"
            />
          </View>
        ) : (
          <View style={styles.actions}>
            {isToday ? (
              <PillButton
                accessibilityLabel="Add a photo to this soundtrack"
                disabled={editing.busy !== null}
                icon="image-outline"
                label={editing.busy === 'photo' ? 'Adding…' : 'Add photo'}
                onPress={() => void editing.addPhoto(photos.length)}
                size="sm"
                testID="ost-add-photo"
              />
            ) : null}
            <PillButton
              accessibilityLabel="Edit the title of this soundtrack"
              icon="pencil"
              label="Title"
              onPress={() => setDraftTitle(title ?? '')}
              size="sm"
              testID="ost-rename"
            />
            <PillButton
              accessibilityLabel={hidePlaces ? 'Places hidden from friends. Show them' : 'Places shown to friends. Hide them'}
              disabled={editing.busy !== null}
              icon={hidePlaces ? 'eye-off-outline' : 'location-outline'}
              label={hidePlaces ? 'Places hidden' : 'Places shown'}
              onPress={() => void editing.setHideLocations(!hidePlaces)}
              size="sm"
              testID="ost-hide-places"
              tone={hidePlaces ? 'accent' : 'neutral'}
            />
          </View>
        )}

        <SegmentedToggle
          accessibilityLabel="Who can see this soundtrack"
          disabled={editing.busy === 'details'}
          onChange={(value) => void editing.setVisibility(value)}
          options={[
            { value: 'private', label: 'Private', icon: 'lock-closed-outline' },
            { value: 'friends', label: 'Friends', icon: 'people-outline' },
          ]}
          testID="ost-visibility"
          value={isPrivate ? 'private' : 'friends'}
        />
        <AppText align="center" testID="ost-visibility-note" variant="caption">
          {isPrivate
            ? 'Only you can see this day.'
            : `Friends see this day in their feed${hidePlaces ? ', without its place names' : ''}.`}
        </AppText>

        {photos.length > 0 ? (
          <PhotoStrip
            disabled={editing.busy !== null}
            onRemove={confirmRemovePhoto}
            photos={photos.map((photo) => ({ key: photo.photoId, url: photo.url }))}
            testID="ost-photo"
          />
        ) : null}

        {editing.notice ? (
          <Notice
            message={editing.notice.message}
            onDismiss={editing.dismissNotice}
            testID="ost-edit-notice"
            title={editing.notice.title}
            tone={editing.notice.tone}
          />
        ) : null}
      </View>
    ) : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <AppText numberOfLines={1} variant="overline">
            Original soundtrack
          </AppText>
          {scoringLive ? <LiveBadge label="Scoring live" outlined={false} /> : null}
        </View>
        <IconButton
          accessibilityLabel="Share this soundtrack"
          disabled={entries.length === 0}
          icon="share-outline"
          onPress={() => router.push({ pathname: '/share', params: { day: String(dayStart) } })}
          testID="ost-share"
        />
      </View>

      {leadPhoto ? (
        <LeadPhoto
          accessibilityLabel={`Photo from ${formatLongDate(dayStart)}`}
          covers={covers}
          onError={() => setFailedPhoto(leadPhoto)}
          shadow
          style={styles.leadPhoto}
          testID="ost-lead-photo"
          uri={leadPhoto}
        />
      ) : (
        <CoverMosaic
          accessibilityLabel={`Cover of the soundtrack for ${formatLongDate(dayStart)}`}
          shadow
          size={176}
          style={styles.mosaic}
          uris={covers}
        />
      )}

      <View style={styles.dayRow}>
        <IconButton
          accessibilityLabel="Previous day"
          icon="chevron-back"
          onPress={() => goToDay(dayOffset - 1)}
          size="sm"
          testID="ost-prev-day"
          variant="ghost"
        />
        <View style={styles.dayText}>
          <AppText
            align="center"
            numberOfLines={1}
            testID={title ? 'ost-date' : undefined}
            tone={isToday ? 'accent' : 'tertiary'}
            variant="overline">
            {title
              ? `${relativeDayLabel(dayStart, today)} · ${formatLongDate(dayStart)}`
              : relativeDayLabel(dayStart, today)}
          </AppText>
          <AppText
            accessibilityRole="header"
            adjustsFontSizeToFit
            align="center"
            minimumFontScale={0.7}
            numberOfLines={2}
            testID={title ? 'ost-title' : 'ost-date'}
            variant="displayMedium">
            {title ?? formatLongDate(dayStart)}
          </AppText>
        </View>
        <IconButton
          accessibilityLabel="Next day"
          disabled={isToday}
          icon="chevron-forward"
          onPress={() => goToDay(dayOffset + 1)}
          size="sm"
          testID="ost-next-day"
          variant="ghost"
        />
      </View>

      <AppText align="center" style={styles.status} testID="ost-summary" tone="secondary">
        {statusLine}
      </AppText>

      {controls}

      {entries.length > 0 ? (
        <SectionHeader detail={cueNumber(entries.length - 1)} style={styles.section} title="Cues" />
      ) : null}
    </View>
  );

  let empty = null;
  if (loading) {
    empty = <TracklistSkeleton testID="ost-loading" />;
  } else if (isToday) {
    empty = (
      <EmptyState
        actionIcon="play"
        actionLabel="Go to Now"
        fill={false}
        icon="musical-notes-outline"
        message="Start scoring on the Now tab and each cue will land here with a title of its own."
        onAction={() => router.navigate('/')}
        testID="ost-empty"
        title="Nothing scored yet"
      />
    );
  } else {
    empty = (
      <EmptyState
        actionIcon="today-outline"
        actionLabel="Back to today"
        fill={false}
        icon="moon-outline"
        message="No cues were logged on this day."
        onAction={() => goToDay(0)}
        testID="ost-empty"
        title="A quiet day"
      />
    );
  }

  return (
    <TabBarProbe>
      <Screen coverUrl={covers[0]} edges="none" padded={false} testID="ost-screen">
        <FlatList
          ItemSeparatorComponent={CueDivider}
          ListEmptyComponent={empty}
          ListHeaderComponent={header}
          contentContainerStyle={{
            paddingTop: insets.top + space.md,
            paddingBottom:
              insets.bottom + layout.tabBarClearance + layout.scrollEndPadding + replayInset,
            paddingHorizontal: layout.screenPadding,
          }}
          contentInsetAdjustmentBehavior="never"
          data={entries}
          keyExtractor={(entry) => entry.playId}
          keyboardShouldPersistTaps="handled"
          // New cues are appended, so the offset holds on its own; this also
          // holds it if the oldest cue ever drops off the top of a long day.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          renderItem={({ item, index }) => (
            <CueRow
              entry={item}
              index={index}
              onPress={onRowPress}
              state={rowState(item)}
              testID={`ost-row-${index + 1}`}
            />
          )}
          showsVerticalScrollIndicator={false}
          testID="ost-list"
        />
      </Screen>
    </TabBarProbe>
  );
}

function CueDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'stretch',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  topBarText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  mosaic: {
    alignSelf: 'center',
    marginTop: space.lg,
  },
  leadPhoto: {
    marginTop: space.lg,
  },
  controls: {
    gap: space.md,
    marginTop: space.lg,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
  },
  titleEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  titleInput: {
    ...typography.title,
    flex: 1,
    height: layout.minTouch,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: space.xl,
  },
  dayText: {
    flex: 1,
    gap: space.xs,
  },
  status: {
    marginTop: space.sm,
    paddingHorizontal: space.lg,
  },
  section: {
    marginTop: space.xl,
    marginBottom: space.xs,
  },
});

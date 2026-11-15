import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, TextInput, View } from 'react-native';

import { CUE_TEXT_INSET, CueRow, type CueRowState } from '@/components/ost/cue-row';
import { useOstEditing } from '@/components/ost/editing';
import {
  addDays,
  dayKey,
  formatLongDate,
  mosaicCovers,
  relativeDayLabel,
  sentenceCase,
  startOfLocalDay,
  toReplayItems,
  trackCount,
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
  PrimaryButton,
  Screen,
  SegmentedToggle,
  useScreenInsets,
} from '@/components/ui';
import { useProfile, useReplay, useSession, type OstEntry } from '@/lib/score';
import { colors, fonts, layout, radius, sizes, space } from '@/theme';

import { TUNING } from '../../../convex/tuning';

const NO_ENTRIES: OstEntry[] = [];
const NO_PHOTOS: OstPhoto[] = [];

/** The Soundtrack tab: one day as a record, with its tracks listed like liner notes. */
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
    if (draftTitle.trim() === (title ?? '') || (await editing.rename(draftTitle))) {
      setDraftTitle(null);
    }
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
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void editing.removePhoto(photo.photoId),
      },
    ]);
  };

  // The replay plays a snapshot of the list taken when it started, and the live
  // list can shift under it (the oldest track drops off), so the playing row is
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

  let statusLine = 'Gathering the day’s tracks…';
  if (!loading) {
    if (entries.length === 0) statusLine = isToday ? 'No tracks yet today' : 'No tracks this day';
    else {
      statusLine = ost.summary
        ? `${trackCount(entries.length)} · ${sentenceCase(ost.summary)}`
        : trackCount(entries.length);
    }
  }

  // The owner's edits to the day: photos, the title, who sees it. They sit
  // between the album block and the tracklist, in the page's own quiet controls.
  const controls =
    entries.length > 0 ? (
      <View style={styles.controls}>
        {draftTitle !== null ? (
          <View style={styles.titleEdit}>
            <TextInput
              accessibilityLabel="Soundtrack title"
              autoCapitalize="sentences"
              autoFocus
              maxLength={TUNING.share.maxTitleChars}
              onChangeText={setDraftTitle}
              onSubmitEditing={saveTitle}
              placeholder={formatLongDate(dayStart)}
              placeholderTextColor={colors.inkFaint}
              returnKeyType="done"
              selectionColor={colors.ink}
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
                label={editing.busy === 'photo' ? 'Adding…' : 'Add photo'}
                onPress={() => void editing.addPhoto(photos.length)}
                size="sm"
                testID="ost-add-photo"
              />
            ) : null}
            <PillButton
              accessibilityLabel="Edit the title of this soundtrack"
              label="Edit title"
              onPress={() => setDraftTitle(title ?? '')}
              size="sm"
              testID="ost-rename"
            />
            <PillButton
              accessibilityLabel={
                hidePlaces
                  ? 'Places hidden from friends. Show them'
                  : 'Places shown to friends. Hide them'
              }
              disabled={editing.busy !== null}
              label={hidePlaces ? 'Places hidden' : 'Places shown'}
              onPress={() => void editing.setHideLocations(!hidePlaces)}
              size="sm"
              testID="ost-hide-places"
            />
          </View>
        )}

        <SegmentedToggle
          accessibilityLabel="Who can see this soundtrack"
          disabled={editing.busy === 'details'}
          onChange={(value) => void editing.setVisibility(value)}
          options={[
            { value: 'private', label: 'Private' },
            { value: 'friends', label: 'Friends' },
          ]}
          testID="ost-visibility"
          value={isPrivate ? 'private' : 'friends'}
        />
        <AppText testID="ost-visibility-note" variant="meta">
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
        <AppText variant="wordmark">Score</AppText>
        <View style={styles.dayNav}>
          <IconButton
            accessibilityLabel="Previous day"
            icon="chevron-back"
            onPress={() => goToDay(dayOffset - 1)}
            size="sm"
            testID="ost-prev-day"
            variant="ghost"
          />
          <AppText numberOfLines={1} style={styles.dayLabel} testID="ost-date" variant="meta">
            {isToday || title ? formatLongDate(dayStart) : relativeDayLabel(dayStart, today)}
          </AppText>
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
      </View>

      <View style={styles.album}>
        {leadPhoto ? (
          <LeadPhoto
            accessibilityLabel={`Photo from ${formatLongDate(dayStart)}`}
            onError={() => setFailedPhoto(leadPhoto)}
            testID="ost-lead-photo"
            uri={leadPhoto}
          />
        ) : (
          <CoverMosaic
            accessibilityLabel={`Cover of the soundtrack for ${formatLongDate(dayStart)}`}
            size={sizes.soundtrackCover}
            uris={covers}
          />
        )}
        <View style={styles.albumText}>
          <AppText
            accessibilityRole="header"
            numberOfLines={3}
            testID={title ? 'ost-title' : undefined}
            variant="screenTitle">
            {title ?? (isToday ? 'Today’s soundtrack' : formatLongDate(dayStart))}
          </AppText>
          <AppText testID="ost-summary" variant="meta">
            {statusLine}
          </AppText>
          {scoringLive ? <LiveBadge label="Scoring now" /> : null}
          <PrimaryButton
            accessibilityLabel="Share this soundtrack"
            disabled={entries.length === 0}
            label="Share"
            onPress={() => router.push({ pathname: '/share', params: { day: String(dayStart) } })}
            style={styles.share}
            testID="ost-share"
          />
        </View>
      </View>

      {controls}

      {entries.length > 0 ? <Divider style={styles.rule} /> : null}
    </View>
  );

  let empty = null;
  if (loading) {
    empty = <TracklistSkeleton testID="ost-loading" />;
  } else if (isToday) {
    empty = (
      <EmptyState
        actionLabel="Set the scene"
        fill={false}
        message="Set the scene and each track will land here with a title of its own."
        onAction={() => router.navigate('/')}
        testID="ost-empty"
        title="Nothing scored yet"
      />
    );
  } else {
    empty = (
      <EmptyState
        actionLabel="Back to today"
        fill={false}
        message="No tracks were logged on this day."
        onAction={() => goToDay(0)}
        testID="ost-empty"
        title="A quiet day"
      />
    );
  }

  return (
    <TabBarProbe>
      <Screen edges="none" padded={false} testID="ost-screen">
        <FlatList
          ItemSeparatorComponent={RowDivider}
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
          // New tracks are appended, so the offset holds on its own; this also
          // holds it if the oldest track ever drops off the top of a long day.
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

function RowDivider() {
  return <Divider inset={CUE_TEXT_INSET} />;
}

const styles = StyleSheet.create({
  header: {
    gap: space.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.minTouch,
  },
  dayNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    // The ghost button's glyph sits inside a 36 pt circle; pull it to the page margin.
    marginRight: -space.sm,
  },
  dayLabel: {
    flexShrink: 1,
  },
  album: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  albumText: {
    flex: 1,
    gap: space.sm,
  },
  share: {
    alignSelf: 'flex-start',
    marginTop: space.xs,
  },
  controls: {
    gap: space.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  titleEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  titleInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    height: sizes.control,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.paperSunk,
    color: colors.ink,
  },
  rule: {
    marginTop: -space.sm,
  },
});

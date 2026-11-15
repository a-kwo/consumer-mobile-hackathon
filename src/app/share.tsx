import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import {
  addDays,
  formatLongDate,
  mosaicCovers,
  startOfLocalDay,
} from '@/components/ost/format';
import { useOst } from '@/components/ost/queries';
import { useMinuteClock } from '@/components/ost/use-clock';
import { captureCard } from '@/components/share/capture';
import { SHARE_CARD_ASPECT, ShareCard } from '@/components/share/share-card';
import {
  AppText,
  EmptyState,
  IconButton,
  Notice,
  PrimaryButton,
  Screen,
  haptics,
  type NoticeTone,
} from '@/components/ui';
import { useProfile } from '@/lib/score';
import { radius, shadows, space } from '@/theme';

/** If a cover never reports back, sharing is offered anyway after this long. */
const IMAGE_WAIT_MS = 6000;

type Problem = { tone: NoticeTone; title: string; message: string };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/ost');
}

/** The share card, full size, with Share and Close. Opened from the Soundtrack tab as a modal. */
export default function ShareScreen() {
  const params = useLocalSearchParams<{ day?: string }>();
  const { deviceId, profile } = useProfile();
  const today = startOfLocalDay(useMinuteClock());

  const requested = Number(params.day);
  const dayStart = Number.isFinite(requested) && requested > 0 ? startOfLocalDay(requested) : today;
  const ost = useOst(deviceId, dayStart, addDays(dayStart, 1));
  const covers = ost ? mosaicCovers(ost.entries) : [];

  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [imagesSettled, setImagesSettled] = useState(false);
  const [waitedLongEnough, setWaitedLongEnough] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLongEnough(true), IMAGE_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const onBoxLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (width !== box?.width || height !== box?.height)) {
      setBox({ width, height });
    }
  };

  const hasCues = !!ost && ost.entries.length > 0;
  const ready = hasCues && !!box && (covers.length === 0 || imagesSettled || waitedLongEnough);
  const cardWidth = box ? Math.floor(Math.min(box.width, box.height * SHARE_CARD_ASPECT)) : 0;

  const share = async () => {
    setProblem(null);
    setBusy(true);
    try {
      let available = false;
      try {
        available = await Sharing.isAvailableAsync();
      } catch {
        available = false;
      }
      if (!available) {
        haptics.warning();
        setProblem({
          tone: 'warning',
          title: 'Sharing is not available here',
          message: 'This device has no share sheet. Take a screenshot of the card instead.',
        });
        return;
      }

      let uri: string;
      try {
        uri = await captureCard(cardRef);
      } catch {
        haptics.error();
        setProblem({
          tone: 'error',
          title: 'Could not make the image',
          message: 'The card could not be saved as a picture. Try again in a moment.',
        });
        return;
      }

      try {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/jpeg',
          UTI: 'public.jpeg',
          dialogTitle: `Original soundtrack, ${formatLongDate(dayStart)}`,
        });
      } catch {
        haptics.error();
        setProblem({
          tone: 'error',
          title: 'Could not open the share sheet',
          message: 'The image was made but sharing did not start. Try again.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen contentStyle={styles.content} coverUrl={covers[0]} testID="share-screen">
      <View style={styles.topBar}>
        <AppText variant="overline">Share card</AppText>
        <IconButton
          accessibilityLabel="Close"
          icon="close"
          onPress={close}
          size="sm"
          testID="share-close"
        />
      </View>

      {ost && !hasCues ? (
        <EmptyState
          icon="image-outline"
          message="A day needs at least one cue before it can become a poster."
          testID="share-empty"
          title="Nothing to share yet"
        />
      ) : (
        <View onLayout={onBoxLayout} style={styles.stage}>
          {ost && box ? (
            <View style={[styles.frame, { width: cardWidth }]}>
              <ShareCard
                cardRef={cardRef}
                covers={covers}
                dayStart={dayStart}
                displayName={profile?.displayName ?? null}
                entries={ost.entries}
                onImagesSettled={() => setImagesSettled(true)}
                topMoods={ost.topMoods}
                width={cardWidth}
              />
            </View>
          ) : (
            <AppText tone="tertiary" variant="caption">
              Setting the poster…
            </AppText>
          )}
        </View>
      )}

      {problem ? (
        <Notice
          message={problem.message}
          onDismiss={() => setProblem(null)}
          testID="share-notice"
          title={problem.title}
          tone={problem.tone}
        />
      ) : null}

      <PrimaryButton
        disabled={!hasCues}
        fullWidth
        icon="share-outline"
        label={ready || !hasCues ? 'Share' : 'Preparing…'}
        loading={busy || (hasCues && !ready)}
        onPress={share}
        size="md"
        testID="share-do"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadows.raised,
  },
});

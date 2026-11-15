import { useRef, type ComponentRef, type RefObject } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { cueNumber, formatLongDate, sentenceCase, trackCount } from '@/components/ost/format';
import { AppText, BrandMark, coverUrlAtSize } from '@/components/ui';
import type { OstEntry } from '@/lib/score';
import { colors, fonts } from '@/theme';

/** Width over height: 9 by 16, which fills a story and crops well to a post. */
export const SHARE_CARD_ASPECT = 9 / 16;
/** The card is designed on a 360 by 640 canvas and scaled to the width it is given. */
const DESIGN_WIDTH = 360;
const MAX_TITLES = 7;

export type ShareCardProps = {
  /** Rendered width in points. The height follows from the aspect ratio. */
  width: number;
  /** Local midnight of the day. */
  dayStart: number;
  entries: readonly OstEntry[];
  /** Up to four cover URLs for the artwork. */
  covers: readonly string[];
  /** The soundtrack's lead photo. When set it is the artwork, in place of the covers. */
  photoUrl?: string | null;
  /** The owner's title for the day. Absent: the date is the title. */
  title?: string | null;
  topMoods: readonly string[];
  /** The profile's display name: "Scored for …". */
  displayName: string | null;
  /** Called once every remote image has loaded or failed, so a capture is complete. */
  onImagesSettled?: () => void;
  /** Ref of the view to capture. */
  cardRef?: RefObject<ComponentRef<typeof View> | null>;
};

/**
 * The day as the liner notes of a record: warm paper, ink type, the artwork
 * (the owner's photo, or the covers when there is none), the title, who it
 * was scored for, the first tracks, the moods and the Score mark. When the
 * soundtrack hides its places, the tracklist uses the titles other people see.
 *
 * Images here are React Native's own `Image`, not expo-image: a view capture
 * draws the card into a software canvas, which cannot draw the hardware
 * bitmaps expo-image uses on Android.
 */
export function ShareCard({
  width,
  dayStart,
  entries,
  covers,
  photoUrl,
  title,
  topMoods,
  displayName,
  onImagesSettled,
  cardRef,
}: ShareCardProps) {
  const u = width / DESIGN_WIDTH;
  const height = width / SHARE_CARD_ASPECT;
  const art = covers.slice(0, 4);
  const titles = entries.slice(0, MAX_TITLES);
  const more = entries.length - titles.length;

  // The images to wait for: the one photo, or the cover tiles.
  const imageCount = photoUrl ? 1 : art.length;
  const settled = useRef(0);
  const onImageEnd = () => {
    settled.current += 1;
    if (settled.current === imageCount) onImagesSettled?.();
  };

  const artSize = 188 * u;
  const tileSource = (uri: string) => ({ uri: coverUrlAtSize(uri, 120) ?? uri });
  const text = (size: number, lineHeight: number) => ({
    fontSize: size * u,
    lineHeight: lineHeight * u,
  });
  const tile = (uri: string) => (
    <Image
      accessible={false}
      onError={onImageEnd}
      onLoad={onImageEnd}
      source={tileSource(uri)}
      style={styles.tile}
    />
  );

  return (
    <View
      collapsable={false}
      ref={cardRef}
      style={[styles.card, { width, height, padding: 28 * u }]}
      testID="share-card">
      <View style={styles.spread}>
        <View style={[styles.brand, { gap: 7 * u }]}>
          <BrandMark size={20 * u} />
          <AppText
            allowFontScaling={false}
            style={[styles.titleFace, text(18, 24), { letterSpacing: -0.18 * u }]}>
            Score
          </AppText>
        </View>
        <AppText allowFontScaling={false} style={[styles.sans, text(11, 16)]} tone="muted">
          Original soundtrack
        </AppText>
      </View>

      <View
        style={[
          styles.art,
          // A photo is set four by three, a little wider than the square of covers.
          {
            width: photoUrl ? 250 * u : artSize,
            height: artSize,
            borderRadius: 6 * u,
            marginTop: 22 * u,
          },
        ]}>
        {photoUrl ? (
          <Image
            accessible={false}
            onError={onImageEnd}
            onLoad={onImageEnd}
            resizeMode="cover"
            source={{ uri: photoUrl }}
            style={styles.tile}
            testID="share-card-photo"
          />
        ) : art.length === 0 ? (
          <View style={styles.artEmpty}>
            <BrandMark color={colors.inkFaint} size={64 * u} />
          </View>
        ) : (
          <View style={[styles.artGrid, { gap: u }]}>
            <View style={[styles.artColumn, { gap: u }]}>
              {tile(art[0])}
              {art.length === 4 ? tile(art[2]) : null}
            </View>
            {art.length >= 2 ? (
              <View style={[styles.artColumn, { gap: u }]}>
                {tile(art[1])}
                {art.length >= 3 ? tile(art[art.length - 1]) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>

      <AppText
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.6}
        numberOfLines={1}
        style={[
          styles.titleFace,
          text(30, 36),
          { letterSpacing: -0.3 * u, marginTop: 20 * u },
        ]}>
        {title || formatLongDate(dayStart)}
      </AppText>
      <AppText
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.italic, text(15, 20), { marginTop: 2 * u }]}
        tone="muted">
        {[
          displayName ? `Scored for ${displayName}` : 'A day, scored',
          title ? formatLongDate(dayStart) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>

      <View style={[styles.rule, { marginTop: 14 * u, marginBottom: 12 * u }]} />

      <View style={{ gap: 4 * u }}>
        {titles.map((entry, index) => (
          <View key={entry.playId} style={[styles.track, { gap: 10 * u }]}>
            <AppText
              allowFontScaling={false}
              style={[styles.sans, styles.tabular, text(10, 19), { width: 16 * u }]}
              tone="muted">
              {cueNumber(index)}
            </AppText>
            <AppText
              allowFontScaling={false}
              numberOfLines={1}
              style={[styles.serif, styles.trackTitle, text(14.5, 19)]}>
              {entry.publicTitle ?? entry.title}
            </AppText>
          </View>
        ))}
        {more > 0 ? (
          <AppText
            allowFontScaling={false}
            style={[styles.sans, text(11, 17), { marginLeft: 26 * u }]}
            tone="muted">
            and {trackCount(more)} more
          </AppText>
        ) : null}
      </View>

      <View style={styles.spacer} />

      <View style={[styles.rule, { marginBottom: 10 * u }]} />
      <View style={[styles.spread, { gap: 12 * u }]}>
        <AppText
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.sans, styles.moods, text(11.5, 16)]}
          tone="muted">
          {topMoods.length > 0 ? sentenceCase(topMoods.join(', ')) : ''}
        </AppText>
        <AppText allowFontScaling={false} style={[styles.sans, text(11.5, 16)]} tone="muted">
          {trackCount(entries.length)}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  art: {
    overflow: 'hidden',
    backgroundColor: colors.paperRaised,
  },
  artEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGrid: {
    flex: 1,
    flexDirection: 'row',
  },
  artColumn: {
    flex: 1,
  },
  tile: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.paperSunk,
  },
  titleFace: {
    fontFamily: fonts.serifMedium,
  },
  serif: {
    fontFamily: fonts.serif,
  },
  italic: {
    fontFamily: fonts.serifItalic,
  },
  sans: {
    fontFamily: fonts.sans,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  rule: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: colors.hairline,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackTitle: {
    flex: 1,
  },
  moods: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
});

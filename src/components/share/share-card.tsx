import { LinearGradient } from 'expo-linear-gradient';
import { useRef, type ComponentRef, type RefObject } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { cueCount, cueNumber, formatLongDate } from '@/components/ost/format';
import { AppText, BrandMark, coverUrlAtSize } from '@/components/ui';
import type { OstEntry } from '@/lib/score';
import { colors, fonts, ink, paper } from '@/theme';

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
  topMoods: readonly string[];
  /** The profile's display name: "Scored for …". */
  displayName: string | null;
  /** Called once every remote image has loaded or failed, so a capture is complete. */
  onImagesSettled?: () => void;
  /** Ref of the view to capture. */
  cardRef?: RefObject<ComponentRef<typeof View> | null>;
};

/**
 * The day as a movie-soundtrack poster: artwork, the date as the title, who it
 * was scored for, the first cues as a tracklist, the moods and the Score mark.
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

  // The backdrop reuses the first cover, so the images to wait for are the tiles plus one.
  const imageCount = art.length > 0 ? art.length + 1 : 0;
  const settled = useRef(0);
  const onImageEnd = () => {
    settled.current += 1;
    if (settled.current === imageCount) onImagesSettled?.();
  };

  const artSize = 168 * u;
  const tileSource = (uri: string) => ({ uri: coverUrlAtSize(uri, 120) ?? uri });
  const text = (size: number, lineHeight: number) => ({ fontSize: size * u, lineHeight: lineHeight * u });

  return (
    <View
      collapsable={false}
      ref={cardRef}
      style={[styles.card, { width, height }]}
      testID="share-card">
      {art.length > 0 ? (
        <Image
          accessible={false}
          blurRadius={30}
          onError={onImageEnd}
          onLoad={onImageEnd}
          resizeMode="cover"
          source={{ uri: coverUrlAtSize(art[0], 40) ?? art[0] }}
          style={[StyleSheet.absoluteFill, styles.wash]}
        />
      ) : null}
      <LinearGradient
        colors={[ink(0.5), ink(0.2), ink(0.78), colors.bg]}
        locations={[0, 0.28, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(245, 168, 60, 0.16)', 'rgba(245, 168, 60, 0)']}
        end={{ x: 0.7, y: 0.5 }}
        start={{ x: 0, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.content, { padding: 28 * u }]}>
        <AppText
          align="center"
          allowFontScaling={false}
          style={[text(10, 13), { letterSpacing: 3.2 * u }]}
          tone="secondary"
          variant="overline">
          Original soundtrack
        </AppText>

        <View
          style={[
            styles.art,
            { width: artSize, height: artSize, borderRadius: 8 * u, marginTop: 18 * u },
          ]}>
          {art.length === 0 ? (
            <View style={styles.artEmpty}>
              <BrandMark size={64 * u} />
            </View>
          ) : (
            <View style={[styles.artGrid, { gap: u }]}>
              <View style={[styles.artColumn, { gap: u }]}>
                <Image
                  accessible={false}
                  onError={onImageEnd}
                  onLoad={onImageEnd}
                  source={tileSource(art[0])}
                  style={styles.tile}
                />
                {art.length === 4 ? (
                  <Image
                    accessible={false}
                    onError={onImageEnd}
                    onLoad={onImageEnd}
                    source={tileSource(art[2])}
                    style={styles.tile}
                  />
                ) : null}
              </View>
              {art.length >= 2 ? (
                <View style={[styles.artColumn, { gap: u }]}>
                  <Image
                    accessible={false}
                    onError={onImageEnd}
                    onLoad={onImageEnd}
                    source={tileSource(art[1])}
                    style={styles.tile}
                  />
                  {art.length >= 3 ? (
                    <Image
                      accessible={false}
                      onError={onImageEnd}
                      onLoad={onImageEnd}
                      source={tileSource(art[art.length - 1])}
                      style={styles.tile}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </View>

        <AppText
          adjustsFontSizeToFit
          align="center"
          allowFontScaling={false}
          minimumFontScale={0.6}
          numberOfLines={1}
          style={[styles.serif, text(34, 40), { marginTop: 18 * u }]}>
          {formatLongDate(dayStart)}
        </AppText>
        <AppText
          align="center"
          allowFontScaling={false}
          numberOfLines={1}
          style={[styles.serifItalic, text(17, 22), { marginTop: 2 * u }]}
          tone="secondary">
          {displayName ? `Scored for ${displayName}` : 'A day, scored'}
        </AppText>

        <View style={[styles.rule, { marginTop: 14 * u, marginBottom: 10 * u }]} />

        <View style={{ gap: 5 * u }}>
          {titles.map((entry, index) => (
            <View key={entry.playId} style={[styles.track, { gap: 10 * u }]}>
              <AppText
                allowFontScaling={false}
                style={[text(9.5, 18), styles.trackNumber, { width: 16 * u }]}
                tone="tertiary"
                variant="numeric">
                {cueNumber(index)}
              </AppText>
              <AppText
                allowFontScaling={false}
                numberOfLines={1}
                style={[styles.serif, styles.trackTitle, text(15, 18)]}>
                {entry.title}
              </AppText>
            </View>
          ))}
          {more > 0 ? (
            <AppText
              allowFontScaling={false}
              style={[text(10.5, 16), { marginLeft: 26 * u }]}
              tone="tertiary"
              variant="caption">
              and {cueCount(more)} more
            </AppText>
          ) : null}
        </View>

        <View style={styles.spacer} />

        {topMoods.length > 0 ? (
          <AppText
            align="center"
            allowFontScaling={false}
            numberOfLines={1}
            style={[text(9.5, 13), { letterSpacing: 2.4 * u, marginBottom: 14 * u }]}
            tone="accent"
            variant="overline">
            {topMoods.join('  ·  ')}
          </AppText>
        ) : null}

        <View style={styles.footer}>
          <View style={[styles.brand, { gap: 7 * u }]}>
            <BrandMark size={20 * u} />
            <AppText
              allowFontScaling={false}
              style={[text(10, 13), { letterSpacing: 3 * u, color: colors.text }]}
              variant="overline">
              Score
            </AppText>
          </View>
          <AppText
            allowFontScaling={false}
            style={[text(9.5, 13), { letterSpacing: 1.6 * u }]}
            tone="tertiary"
            variant="overline">
            {cueCount(entries.length)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: colors.bgRaised,
  },
  wash: {
    opacity: 0.75,
  },
  content: {
    flex: 1,
  },
  art: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: paper(0.22),
  },
  artEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised,
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
    backgroundColor: colors.bgRaised,
  },
  serif: {
    fontFamily: fonts.serif,
    letterSpacing: 0,
    color: colors.text,
  },
  serifItalic: {
    fontFamily: fonts.serifItalic,
  },
  rule: {
    alignSelf: 'center',
    width: '26%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: paper(0.4),
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackNumber: {
    letterSpacing: 0.4,
  },
  trackTitle: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

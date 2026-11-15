import type { StyleProp, TextStyle } from 'react-native';

import { AppText } from '@/components/ui';
import type { PlayContext, Scene, ScoreLocation } from '@/lib/score';

import { metaLine, occasionShort } from './format';

/** About what fits on one line of meta text on a 375-wide phone before it has to shrink. */
const MAX_CHARS = 46;
const MAX_PLACE_CHARS = 26;

type Props = {
  /** The context right now: `useSensing().context`. */
  context: PlayContext;
  /** The scene of the playing song, which knows the weather the server resolved. */
  playingScene?: Scene | null;
  /** The scene right now, which carries the occasion ahead. */
  scene: Scene;
  /** Where the user is, by name: `useSensing().location`. */
  location: ScoreLocation | null;
  /** "Calmer for 2 more cues", or null. */
  nudge?: string | null;
  align?: TextStyle['textAlign'];
  testID: string;
  style?: StyleProp<TextStyle>;
};

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * The one meta line of the Now screen: "100 steps/min · Rain · 5th Avenue",
 * with the occasion ahead and the nudge being carried when there are any.
 *
 * It stays on one line. When there is too much to say the least important
 * part goes first: the weather (always, when a place and an occasion are both
 * present), then the cadence. The place, the occasion and the nudge stay.
 */
export function MetaLine({ context, playingScene, scene, location, nudge, align, testID, style }: Props) {
  const rawPlace = location
    ? (location.street ?? location.area ?? location.city ?? location.label)
    : (context.placeName ?? null);
  const place = rawPlace ? shorten(rawPlace, MAX_PLACE_CHARS) : null;
  const occasion = occasionShort(scene);

  const withWeather = metaLine(context, playingScene);
  const cadenceOnly = metaLine(context, playingScene, true);
  const extras = [place, occasion, nudge].filter(Boolean).join(' · ');
  const length = (lead: string) => lead.length + (extras ? extras.length + 3 : 0);

  let lead: string | null = withWeather;
  if ((place && occasion) || length(withWeather) > MAX_CHARS) lead = cadenceOnly;
  if (lead === cadenceOnly && extras && length(cadenceOnly) > MAX_CHARS) lead = null;

  const separator = (first: boolean) => (first ? '' : ' · ');
  const placeFirst = lead === null;
  const occasionFirst = placeFirst && !place;
  const nudgeFirst = occasionFirst && !occasion;

  return (
    <AppText
      accessibilityLiveRegion="polite"
      adjustsFontSizeToFit
      align={align}
      minimumFontScale={0.85}
      numberOfLines={1}
      style={style}
      testID={testID}
      tone="muted"
      variant="meta">
      {lead}
      {place ? (
        <AppText accessibilityLabel={`At ${rawPlace}`} testID="now-place" tone="muted" variant="meta">
          {`${separator(placeFirst)}${place}`}
        </AppText>
      ) : null}
      {occasion ? (
        <AppText accessibilityLabel={scene.occasionLine} testID="now-occasion" tone="primary" variant="meta">
          {`${separator(occasionFirst)}${occasion}`}
        </AppText>
      ) : null}
      {nudge ? (
        <AppText testID="now-nudge" tone="primary" variant="meta">
          {`${separator(nudgeFirst)}${nudge}`}
        </AppText>
      ) : null}
    </AppText>
  );
}

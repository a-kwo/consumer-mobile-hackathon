/**
 * Raw cover colours of songs that have been handed to the replay, by Deezer id.
 *
 * The engine's `ReplayItem` carries no colour, so screens record it here when
 * they build a replay list and the replay bar reads it back to tint its
 * progress line and equalizer with the song's album ink.
 */
const coverColors = new Map<number, string>();

export function rememberCoverColor(deezerId: number, coverColor: string | undefined): void {
  if (coverColor) coverColors.set(deezerId, coverColor);
}

/** The raw cover colour recorded for a song, if any. Pass it through `albumInk`. */
export function coverColorOf(deezerId: number | undefined): string | undefined {
  return deezerId === undefined ? undefined : coverColors.get(deezerId);
}

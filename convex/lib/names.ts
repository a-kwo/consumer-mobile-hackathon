/**
 * Profile names and avatars. There is no sign-up: a new profile gets the
 * default name and an emoji picked by its deviceId, and its owner can change both.
 */
import { hashString } from './hash';

/** What a new profile is called until its owner renames it. */
export const DEFAULT_DISPLAY_NAME = 'Aiden';

const ANIMALS = [
  ['Otter', '🦦'], ['Fox', '🦊'], ['Owl', '🦉'], ['Whale', '🐋'], ['Koala', '🐨'], ['Panda', '🐼'],
  ['Tiger', '🐯'], ['Rabbit', '🐰'], ['Swan', '🦢'], ['Dolphin', '🐬'], ['Hedgehog', '🦔'], ['Deer', '🦌'],
  ['Sloth', '🦥'], ['Seal', '🦭'], ['Bee', '🐝'], ['Turtle', '🐢'], ['Penguin', '🐧'], ['Raccoon', '🦝'],
  ['Flamingo', '🦩'], ['Cat', '🐱'], ['Wolf', '🐺'], ['Bear', '🐻'], ['Butterfly', '🦋'], ['Parrot', '🦜'],
  ['Badger', '🦡'], ['Octopus', '🐙'], ['Peacock', '🦚'], ['Frog', '🐸'],
] as const;

export const MAX_DISPLAY_NAME_CHARS = 24;

/** The default name, and an emoji that is always the same for the same deviceId. */
export function generatedProfile(deviceId: string): { displayName: string; avatarEmoji: string } {
  const [, avatarEmoji] = ANIMALS[hashString(`animal:${deviceId}`) % ANIMALS.length];
  return { displayName: DEFAULT_DISPLAY_NAME, avatarEmoji };
}

/** Collapses whitespace and cuts to 24 characters. Null when nothing printable is left. */
export function cleanDisplayName(input: string): string | null {
  const collapsed = input.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  const cut = Array.from(collapsed).slice(0, MAX_DISPLAY_NAME_CHARS).join('').trim();
  return cut.length > 0 ? cut : null;
}

// One emoji: a flag, a keycap, or a pictograph with its modifiers and ZWJ joins.
const EMOJI =
  /\p{Regional_Indicator}{2}|[0-9#*]\ufe0f?\u20e3|\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})*(?:\u200d\p{Extended_Pictographic}(?:\ufe0f|\p{Emoji_Modifier})*)*/u;

/** The first emoji in the input, or null when it has none. */
export function firstEmoji(input: string): string | null {
  return input.match(EMOJI)?.[0] ?? null;
}

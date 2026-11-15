/**
 * Profile names and avatars. There is no sign-up: a device gets a pleasant
 * generated name ("Quiet Otter") that is always the same for the same deviceId.
 */
import { hashString } from './hash';

const ADJECTIVES = [
  'Quiet', 'Gentle', 'Mellow', 'Golden', 'Velvet', 'Amber', 'Misty', 'Sunny', 'Lucky', 'Cosmic',
  'Dusky', 'Breezy', 'Starry', 'Dreamy', 'Mossy', 'Sleepy', 'Bright', 'Wandering', 'Midnight', 'Silver',
  'Copper', 'Indigo', 'Lunar', 'Honey', 'Cedar', 'Coral', 'Hazel', 'Paper', 'Electric', 'Neon',
] as const;

const ANIMALS = [
  ['Otter', '🦦'], ['Fox', '🦊'], ['Owl', '🦉'], ['Whale', '🐋'], ['Koala', '🐨'], ['Panda', '🐼'],
  ['Tiger', '🐯'], ['Rabbit', '🐰'], ['Swan', '🦢'], ['Dolphin', '🐬'], ['Hedgehog', '🦔'], ['Deer', '🦌'],
  ['Sloth', '🦥'], ['Seal', '🦭'], ['Bee', '🐝'], ['Turtle', '🐢'], ['Penguin', '🐧'], ['Raccoon', '🦝'],
  ['Flamingo', '🦩'], ['Cat', '🐱'], ['Wolf', '🐺'], ['Bear', '🐻'], ['Butterfly', '🦋'], ['Parrot', '🦜'],
  ['Badger', '🦡'], ['Octopus', '🐙'], ['Peacock', '🦚'], ['Frog', '🐸'],
] as const;

export const MAX_DISPLAY_NAME_CHARS = 24;

/** A two-word name and a matching emoji, deterministic from the deviceId. */
export function generatedProfile(deviceId: string): { displayName: string; avatarEmoji: string } {
  const adjective = ADJECTIVES[hashString(`adjective:${deviceId}`) % ADJECTIVES.length];
  const [animal, avatarEmoji] = ANIMALS[hashString(`animal:${deviceId}`) % ANIMALS.length];
  return { displayName: `${adjective} ${animal}`, avatarEmoji };
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

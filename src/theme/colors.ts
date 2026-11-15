/**
 * Score colour tokens. Dark only.
 *
 * The base is a near-black with a trace of blue-violet, never a grey panel.
 * Depth comes from `AmbientBackground` (the current cover, blurred and dimmed)
 * rather than from stacked opaque cards, so surfaces are white at low alpha
 * with a hairline border.
 *
 * There is exactly one accent: projector amber. Use it for the one thing on
 * screen that is live or primary. `energy` (warm) and `calm` (cool) are
 * semantic, not decorative.
 */

/** Off-white "paper" used for all text, expressed as RGB so alpha steps stay in sync. */
const PAPER = '243, 239, 230';
/** The base near-black as RGB, for scrims and gradients that must end on the base. */
const INK = '10, 10, 14';

export const colors = {
  // Base
  bg: '#0A0A0E',
  /** Opaque step above the base, for the rare thing that cannot be translucent (sheets, share card). */
  bgRaised: '#14141B',
  black: '#000000',

  // Text: off-white with two quieter steps
  text: '#F3EFE6',
  textSecondary: `rgba(${PAPER}, 0.66)`,
  textTertiary: `rgba(${PAPER}, 0.42)`,
  textDisabled: `rgba(${PAPER}, 0.26)`,
  /** Text and icons on top of a filled accent control. */
  textOnAccent: '#1B1206',

  // Accent: projector amber. Use sparingly.
  accent: '#F5A83C',
  accentBright: '#FFC56B',
  accentDim: 'rgba(245, 168, 60, 0.14)',
  accentBorder: 'rgba(245, 168, 60, 0.36)',

  // Semantic
  /** Warm: high energy, faster, "more energy". */
  energy: '#FF7A4A',
  energyDim: 'rgba(255, 122, 74, 0.14)',
  energyBorder: 'rgba(255, 122, 74, 0.34)',
  /** Cool: calm, slower, "calmer", simulated. */
  calm: '#7FB2F0',
  calmDim: 'rgba(127, 178, 240, 0.14)',
  calmBorder: 'rgba(127, 178, 240, 0.34)',
  danger: '#FF6B61',
  dangerDim: 'rgba(255, 107, 97, 0.13)',
  dangerBorder: 'rgba(255, 107, 97, 0.34)',
  success: '#7FD6A4',
  successDim: 'rgba(127, 214, 164, 0.13)',
  successBorder: 'rgba(127, 214, 164, 0.32)',

  // Translucent surfaces
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceRaised: 'rgba(255, 255, 255, 0.10)',
  surfacePressed: 'rgba(255, 255, 255, 0.15)',
  hairline: 'rgba(255, 255, 255, 0.10)',
  hairlineStrong: 'rgba(255, 255, 255, 0.20)',

  // Scrims over imagery
  scrim: `rgba(${INK}, 0.55)`,
  scrimHeavy: `rgba(${INK}, 0.82)`,
  transparent: 'transparent',
} as const;

export type ColorToken = keyof typeof colors;

/** The base colour at a given alpha, for gradients that fade into the background. */
export function ink(alpha: number): string {
  return `rgba(${INK}, ${alpha})`;
}

/** The text colour at a given alpha. */
export function paper(alpha: number): string {
  return `rgba(${PAPER}, ${alpha})`;
}

/**
 * Tones shared by Chip, LiveBadge, Meter, Notice, PillButton and friends.
 * `fg` is for text and icons, `bg` and `border` for a tinted translucent fill,
 * `solid` for bars and dots.
 */
export type Tone = 'neutral' | 'accent' | 'energy' | 'calm' | 'danger' | 'success';

export const tones: Record<Tone, { fg: string; bg: string; border: string; solid: string }> = {
  neutral: {
    fg: colors.textSecondary,
    bg: colors.surface,
    border: colors.hairline,
    solid: colors.text,
  },
  accent: {
    fg: colors.accent,
    bg: colors.accentDim,
    border: colors.accentBorder,
    solid: colors.accent,
  },
  energy: {
    fg: colors.energy,
    bg: colors.energyDim,
    border: colors.energyBorder,
    solid: colors.energy,
  },
  calm: {
    fg: colors.calm,
    bg: colors.calmDim,
    border: colors.calmBorder,
    solid: colors.calm,
  },
  danger: {
    fg: colors.danger,
    bg: colors.dangerDim,
    border: colors.dangerBorder,
    solid: colors.danger,
  },
  success: {
    fg: colors.success,
    bg: colors.successDim,
    border: colors.successBorder,
    solid: colors.success,
  },
};

/** Text colour roles accepted by `AppText` and `Icon`. */
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'accent'
  | 'energy'
  | 'calm'
  | 'danger'
  | 'success'
  | 'onAccent';

export const textColors: Record<TextTone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  disabled: colors.textDisabled,
  accent: colors.accent,
  energy: colors.energy,
  calm: colors.calm,
  danger: colors.danger,
  success: colors.success,
  onAccent: colors.textOnAccent,
};

/**
 * Score colour tokens: warm paper and brown-black ink, like the liner notes
 * of a record. Light only; there is no dark theme.
 *
 * There is no accent colour in the theme. The only colour on screen besides
 * paper and ink is "album ink", computed per song from its cover and passed
 * to graphics (`tint` on `ProgressBar`, `EqualizerBars`, `Meter`,
 * `LabeledSlider`). Album ink is never used for text.
 *
 * The first block is the identity's own vocabulary. The second block keeps
 * the names the first version of the kit used, re-pointed at paper and ink,
 * so existing screens keep compiling. New code should use the first block.
 */

const PAPER_RGB = '244, 237, 225';
const INK_RGB = '43, 36, 32';

export const colors = {
  // ── The identity ───────────────────────────────────────────────────────
  /** Screen background. */
  paper: '#F4EDE1',
  /** Placeholder covers, sheets, panels. */
  paperRaised: '#FBF7EF',
  /** Secondary buttons and other controls. */
  paperSunk: '#EAE1D2',
  /** A control on `paperSunk` while pressed, and the selected step of a quiet control. */
  paperPressed: '#DFD4C2',
  /** Dividers and the progress track. */
  hairline: '#DDD3C3',
  /** Primary text, the play button, the primary button. */
  ink: '#2B2420',
  /** The reason line. Also `ink` controls while pressed. */
  inkSoft: '#4A413A',
  /** Artist, scene line, meta text, inactive tabs. About 4.9:1 on paper: do not go lighter for text. */
  inkMuted: '#6F655C',
  /** Disabled glyphs and placeholder icons only. Too light for text that must be read. */
  inkFaint: '#A89E92',

  /** Something failed. An earth red, used only by `Notice` and destructive labels. */
  danger: '#9A3B2B',
  dangerDim: '#F1DDD2',
  /** Something worked. A moss green, used only by `Notice`. */
  success: '#4C6A3A',
  successDim: '#E2E6D0',

  /** A veil over imagery, for text on top of a photograph. */
  scrim: `rgba(${INK_RGB}, 0.35)`,
  scrimHeavy: `rgba(${INK_RGB}, 0.6)`,
  transparent: 'transparent',
  black: '#000000',

  // ── Names kept from the first kit (aliases) ────────────────────────────
  bg: '#F4EDE1',
  bgRaised: '#FBF7EF',
  text: '#2B2420',
  textSecondary: '#6F655C',
  textTertiary: '#6F655C',
  textDisabled: '#A89E92',
  /** Text and icons on an `ink` fill. */
  textOnAccent: '#F4EDE1',
  /** There is no accent colour any more: "accent" is ink. */
  accent: '#2B2420',
  accentBright: '#4A413A',
  accentDim: '#DFD4C2',
  accentBorder: '#DFD4C2',
  energy: '#2B2420',
  energyDim: '#EAE1D2',
  energyBorder: '#EAE1D2',
  calm: '#6F655C',
  calmDim: '#EAE1D2',
  calmBorder: '#EAE1D2',
  dangerBorder: '#F1DDD2',
  successBorder: '#E2E6D0',
  surface: '#EAE1D2',
  surfaceRaised: '#FBF7EF',
  surfacePressed: '#DFD4C2',
  hairlineStrong: '#DDD3C3',
} as const;

export type ColorToken = keyof typeof colors;

/** Paper at a given alpha, for fades into the screen background. */
export function paperAlpha(alpha: number): string {
  return `rgba(${PAPER_RGB}, ${alpha})`;
}

/** Ink at a given alpha. Not for text: use `ink`, `inkSoft` or `inkMuted`. */
export function inkAlpha(alpha: number): string {
  return `rgba(${INK_RGB}, ${alpha})`;
}

/**
 * @deprecated Kept so existing screens compile. In the first kit this meant
 * "the background colour at an alpha", and it still does: it now returns
 * PAPER. Use `paperAlpha`.
 */
export function ink(alpha: number): string {
  return paperAlpha(alpha);
}

/**
 * @deprecated Kept so existing screens compile. In the first kit this meant
 * "the text colour at an alpha", and it still does: it now returns INK. Use
 * `inkAlpha`.
 */
export function paper(alpha: number): string {
  return inkAlpha(alpha);
}

/**
 * Tones accepted by Chip, LiveBadge, Meter, Notice, PillButton and friends.
 * Only `danger` and `success` carry a hue; the rest are steps of ink, because
 * the theme has no accent. `fg` is for text and icons, `bg` for a fill,
 * `solid` for bars and dots. `border` equals `bg`: nothing in the kit is
 * outlined.
 */
export type Tone = 'neutral' | 'accent' | 'energy' | 'calm' | 'danger' | 'success';

export const tones: Record<Tone, { fg: string; bg: string; border: string; solid: string }> = {
  neutral: {
    fg: colors.inkMuted,
    bg: colors.paperSunk,
    border: colors.paperSunk,
    solid: colors.ink,
  },
  accent: { fg: colors.ink, bg: colors.paperSunk, border: colors.paperSunk, solid: colors.ink },
  energy: { fg: colors.ink, bg: colors.paperSunk, border: colors.paperSunk, solid: colors.ink },
  calm: {
    fg: colors.inkMuted,
    bg: colors.paperSunk,
    border: colors.paperSunk,
    solid: colors.inkMuted,
  },
  danger: {
    fg: colors.danger,
    bg: colors.dangerDim,
    border: colors.dangerDim,
    solid: colors.danger,
  },
  success: {
    fg: colors.success,
    bg: colors.successDim,
    border: colors.successDim,
    solid: colors.success,
  },
};

/**
 * Text colour roles accepted by `AppText` and `Icon`. Use `primary` (ink),
 * `soft` (inkSoft) and `muted` (inkMuted). The other names are kept from the
 * first kit and resolve to one of those three.
 */
export type TextTone =
  | 'primary'
  | 'soft'
  | 'muted'
  | 'secondary'
  | 'tertiary'
  | 'disabled'
  | 'accent'
  | 'energy'
  | 'calm'
  | 'danger'
  | 'success'
  | 'onInk'
  | 'onAccent';

export const textColors: Record<TextTone, string> = {
  primary: colors.ink,
  soft: colors.inkSoft,
  muted: colors.inkMuted,
  secondary: colors.inkMuted,
  tertiary: colors.inkMuted,
  disabled: colors.inkFaint,
  accent: colors.ink,
  energy: colors.ink,
  calm: colors.inkMuted,
  danger: colors.danger,
  success: colors.success,
  onInk: colors.paper,
  onAccent: colors.paper,
};

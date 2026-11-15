/**
 * Score design tokens.
 *
 *   import { colors, space, radius, typography } from '@/theme';
 *
 * Screens should rarely need raw tokens: the kit in `@/components/ui` already
 * applies them. Reach for tokens when composing a layout (gaps, paddings) or
 * a one-off element.
 */
export { colors, ink, paper, textColors, tones } from './colors';
export type { ColorToken, TextTone, Tone } from './colors';
export { glow, layout, radius, shadows, space } from './layout';
export type { RadiusToken, SpaceToken } from './layout';
export { beatDurationMs, motion, PULSE_BPM_RANGE } from './motion';
export { fonts, serifVariants, typography } from './typography';
export type { TextVariant } from './typography';

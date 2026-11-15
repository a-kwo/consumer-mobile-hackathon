/**
 * Score design tokens: paper, ink, Fraunces and Hanken Grotesk.
 *
 *   import { colors, space, radius, sizes, typography } from '@/theme';
 *
 * Screens should rarely need raw tokens: the kit in `@/components/ui` already
 * applies them. Reach for tokens when composing a layout (gaps, paddings) or
 * a one-off element.
 */
export { colors, ink, inkAlpha, paper, paperAlpha, textColors, tones } from './colors';
export type { ColorToken, TextTone, Tone } from './colors';
export { glow, layout, radius, shadows, sizes, space } from './layout';
export type { RadiusToken, SpaceToken } from './layout';
export { beatDurationMs, motion, PULSE_BPM_RANGE } from './motion';
export { fontFace, fontFaces, fonts, serifVariants, typography } from './typography';
export type { FontKind, TextVariant } from './typography';

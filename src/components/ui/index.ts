/**
 * Score's UI kit. Build screens from these, with tokens from `@/theme`.
 *
 *   import { Screen, AppText, CoverArt, PrimaryButton } from '@/components/ui';
 *
 * Every primitive is rendered in its main states on the hidden `/kit` route
 * (src/app/kit.tsx), which is the quickest way to see what exists.
 */

// Frame
export { AmbientBackground } from './ambient-background';
export type { AmbientBackgroundProps } from './ambient-background';
export { Screen, TabBarInsetProvider, useScreenInsets } from './screen';
export type { ScreenInsets, ScreenProps } from './screen';

// Type and icons
export { AppText } from './app-text';
export type { AppTextProps } from './app-text';
export { Icon } from './icon';
export type { IconName, IconProps } from './icon';
export { BrandMark } from './brand-mark';
export type { BrandMarkProps } from './brand-mark';

// Status
export { Chip } from './chip';
export type { ChipProps } from './chip';
export { LiveBadge } from './live-badge';
export type { LiveBadgeProps } from './live-badge';
export { EqualizerBars } from './equalizer-bars';
export type { EqualizerBarsProps } from './equalizer-bars';
export { ProgressBar } from './progress-bar';
export type { ProgressBarProps } from './progress-bar';
export { Meter } from './meter';
export type { MeterProps } from './meter';
export { Notice } from './notice';
export type { NoticeProps, NoticeTone } from './notice';

// Controls
export { IconButton } from './icon-button';
export type { IconButtonProps } from './icon-button';
export { PrimaryButton } from './primary-button';
export type { PrimaryButtonProps } from './primary-button';
export { PillButton } from './pill-button';
export type { PillButtonProps } from './pill-button';
export { ChoiceChips } from './choice-chips';
export type { ChoiceChipsProps, ChoiceOption } from './choice-chips';
export { SegmentedToggle } from './segmented-toggle';
export type { SegmentedToggleProps, SegmentOption } from './segmented-toggle';
export { LabeledSlider } from './labeled-slider';
export type { LabeledSliderProps } from './labeled-slider';
export { PressableScale } from './pressable-scale';
export type { PressableScaleProps } from './pressable-scale';
export { haptics } from './haptics';
export type { HapticKind } from './haptics';

// Imagery
export { CoverArt } from './cover-art';
export type { CoverArtProps } from './cover-art';
export { CoverMosaic } from './cover-mosaic';
export type { CoverMosaicProps } from './cover-mosaic';
export { coverUrlAtSize } from './cover-url';
export { Avatar } from './avatar';
export type { AvatarProps } from './avatar';

// Structure
export { Surface } from './surface';
export type { SurfaceProps } from './surface';
export { SectionHeader } from './section-header';
export type { SectionHeaderProps } from './section-header';
export { ListRow } from './list-row';
export type { ListRowProps } from './list-row';
export { Divider } from './divider';
export type { DividerProps } from './divider';
export { EmptyState } from './empty-state';
export type { EmptyStateProps } from './empty-state';

// App start-up
export { kitFonts } from './kit-fonts';

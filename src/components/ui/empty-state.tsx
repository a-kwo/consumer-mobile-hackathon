import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout, space } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { PillButton } from './pill-button';

export type EmptyStateProps = {
  /** Shown as a title card in the serif. */
  title: string;
  message?: string;
  icon?: IconName;
  /** A film-credits label above the title: "Scene 01". */
  overline?: string;
  /** Label of the optional action. Needs `onAction`. */
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  /** Take all available space and centre within it. Turn off inside a list or panel. @default true */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * What a screen shows when it has nothing yet: an icon, a title card, one
 * sentence, and optionally the action that fixes it.
 *
 *   <EmptyState
 *     icon="musical-notes-outline"
 *     overline="Original soundtrack"
 *     title="Nothing scored yet"
 *     message="Start scoring on the Now tab and today's cues will collect here."
 *     actionLabel="Go to Now"
 *     onAction={() => router.navigate('/')}
 *   />
 */
export function EmptyState({
  title,
  message,
  icon,
  overline,
  actionLabel,
  actionIcon,
  onAction,
  fill = true,
  style,
  testID,
}: EmptyStateProps) {
  return (
    <View style={[styles.root, fill ? styles.fill : null, style]} testID={testID}>
      {icon ? (
        <View style={styles.medallion}>
          <Icon name={icon} size={26} tone="secondary" />
        </View>
      ) : null}
      <View style={styles.text}>
        {overline ? (
          <AppText align="center" variant="overline">
            {overline}
          </AppText>
        ) : null}
        <AppText accessibilityRole="header" align="center" variant="displayMedium">
          {title}
        </AppText>
        {message ? (
          <AppText align="center" style={styles.message} tone="secondary">
            {message}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <PillButton icon={actionIcon} label={actionLabel} onPress={onAction} tone="accent" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xl,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  fill: {
    flex: 1,
  },
  medallion: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
  },
  text: {
    alignItems: 'center',
    gap: space.sm,
  },
  message: {
    maxWidth: 300,
    marginTop: space.xs,
  },
});

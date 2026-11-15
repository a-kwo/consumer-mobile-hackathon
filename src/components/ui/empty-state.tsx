import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, space } from '@/theme';

import { AppText } from './app-text';
import { Icon, type IconName } from './icon';
import { PrimaryButton } from './primary-button';

export type EmptyStateProps = {
  /** Shown in Fraunces, as a screen title. */
  title: string;
  message?: string;
  icon?: IconName;
  /** A line of muted meta text above the title. */
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
 * What a screen shows when it has nothing yet: an icon, a title, one
 * sentence, and optionally the action that fixes it.
 *
 *   <EmptyState
 *     icon="musical-notes-outline"
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
          <Icon name={icon} size={24} tone="muted" />
        </View>
      ) : null}
      <View style={styles.text}>
        {overline ? (
          <AppText align="center" variant="meta">
            {overline}
          </AppText>
        ) : null}
        <AppText accessibilityRole="header" align="center" variant="screenTitle">
          {title}
        </AppText>
        {message ? (
          <AppText align="center" style={styles.message} tone="muted">
            {message}
          </AppText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <PrimaryButton icon={actionIcon} label={actionLabel} onPress={onAction} />
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
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperSunk,
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

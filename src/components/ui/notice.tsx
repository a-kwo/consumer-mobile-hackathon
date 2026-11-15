import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, radius, space, tones, type Tone } from '@/theme';

import { AppText } from './app-text';
import { haptics } from './haptics';
import { Icon, type IconName } from './icon';

export type NoticeTone = 'info' | 'warning' | 'error' | 'success';

export type NoticeProps = {
  /** The one sentence to read. */
  message: string;
  /** An optional bold lead-in. */
  title?: string;
  /**
   * `info` (cool) for neutral status such as simulated mode, `warning`
   * (amber), `error` (red) for something that failed, `success` (green).
   * @default 'info'
   */
  tone?: NoticeTone;
  /** Overrides the tone's default icon. */
  icon?: IconName;
  /** Label of an inline action such as "Retry". Needs `onAction`. */
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a close button. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const toneMap: Record<NoticeTone, { tone: Tone; icon: IconName }> = {
  info: { tone: 'calm', icon: 'information-circle-outline' },
  warning: { tone: 'accent', icon: 'alert-circle-outline' },
  error: { tone: 'danger', icon: 'warning-outline' },
  success: { tone: 'success', icon: 'checkmark-circle-outline' },
};

/**
 * An inline banner for status and errors. It sits in the layout (it is not a
 * toast) so a screenshot always shows what went wrong.
 *
 *   <Notice message="No step sensor here. Using simulated values." />
 *   <Notice tone="error" title="Could not reach Score" message="Check your connection."
 *     actionLabel="Retry" onAction={retry} />
 */
export function Notice({
  message,
  title,
  tone = 'info',
  icon,
  actionLabel,
  onAction,
  onDismiss,
  style,
  testID,
}: NoticeProps) {
  const mapped = toneMap[tone];
  const palette = tones[mapped.tone];

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.notice, { backgroundColor: palette.bg, borderColor: palette.border }, style]}
      testID={testID}>
      <Icon color={palette.fg} name={icon ?? mapped.icon} size={20} style={styles.icon} />
      <View style={styles.text}>
        {title ? <AppText variant="label">{title}</AppText> : null}
        <AppText tone={title ? 'secondary' : 'primary'} variant="caption">
          {message}
        </AppText>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => {
              haptics.tap();
              onAction();
            }}
            style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}>
            <AppText style={{ color: palette.fg }} variant="label">
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onDismiss}
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Icon name="close" size={18} tone="secondary" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md + 2,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
  },
  icon: {
    marginTop: -1,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
  action: {
    alignSelf: 'flex-start',
    marginTop: space.sm,
  },
  pressed: {
    opacity: 0.6,
  },
});

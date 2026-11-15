import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space, tones, type Tone } from '@/theme';

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
   * `info` and `warning` are ink on paperSunk (they differ by icon), `error`
   * is earth red for something that failed, `success` is moss green.
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
  info: { tone: 'neutral', icon: 'information-circle-outline' },
  warning: { tone: 'neutral', icon: 'alert-circle-outline' },
  error: { tone: 'danger', icon: 'warning-outline' },
  success: { tone: 'success', icon: 'checkmark-circle-outline' },
};

/**
 * An inline banner for status and errors. It sits in the layout (it is not a
 * toast) so a screenshot always shows what went wrong.
 *
 *   <Notice message="No step sensor here. Set the scene by hand." />
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
  const hued = tone === 'error' || tone === 'success';

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.notice, { backgroundColor: palette.bg }, style]}
      testID={testID}>
      <Icon color={hued ? palette.fg : colors.ink} name={icon ?? mapped.icon} size={20} />
      <View style={styles.text}>
        {title ? <AppText variant="label">{title}</AppText> : null}
        <AppText tone={title ? 'soft' : 'primary'} variant="meta">
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
            <AppText
              style={[styles.actionLabel, hued ? { color: palette.fg } : null]}
              variant="label">
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
          <Icon name="close" size={18} tone="muted" />
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
    borderRadius: radius.control,
  },
  actionLabel: {
    textDecorationLine: 'underline',
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

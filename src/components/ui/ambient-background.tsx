import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

export type AmbientBackgroundProps = {
  /** @deprecated Ignored. The ground is plain paper; cover colour reaches the screen only as album ink. */
  coverUrl?: string | null;
  /** @deprecated Ignored. */
  dim?: number;
  /** @deprecated Ignored. */
  grain?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The ground of every screen: plain warm paper. It fills its parent
 * absolutely and never takes touches. `Screen` renders it for you.
 *
 * In the first kit this drew a blurred wash of the cover; the props are kept
 * so existing code compiles, and are ignored.
 */
export function AmbientBackground({ style }: AmbientBackgroundProps) {
  return <View style={[StyleSheet.absoluteFill, styles.paper, style]} />;
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: colors.paper,
    pointerEvents: 'none',
  },
});

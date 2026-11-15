import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, layout } from '@/theme';

export type DividerProps = {
  /** Left inset in points, to align the rule with a row's text past its leading element. */
  inset?: number;
  /** Draw a vertical rule between items in a row. */
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A hairline rule.
 *
 *   <Divider />
 *   <Divider inset={52 + space.md} />    under a ListRow with a 52 pt cover
 */
export function Divider({ inset = 0, vertical = false, style }: DividerProps) {
  return (
    <View style={[vertical ? styles.vertical : styles.horizontal, { marginLeft: inset }, style]} />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    alignSelf: 'stretch',
    height: layout.hairline,
    backgroundColor: colors.hairline,
  },
  vertical: {
    alignSelf: 'stretch',
    width: layout.hairline,
    backgroundColor: colors.hairline,
  },
});

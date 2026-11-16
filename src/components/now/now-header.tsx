import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';

/** The top row of the Now screen: the wordmark. */
export function NowHeader() {
  return (
    <View style={styles.row}>
      <AppText accessibilityRole="header" variant="wordmark">
        Rubato
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 28,
    justifyContent: 'center',
    // The figure's box reaches a little above the stage and ends in opaque
    // paper; the header stays on top of it.
    zIndex: 1,
  },
});

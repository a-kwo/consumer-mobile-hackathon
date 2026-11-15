import { Fragment } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText, Divider, Icon, PillButton, PressableScale } from '@/components/ui';
import type { SensingApi } from '@/lib/score';
import { colors, radius, shadows, space } from '@/theme';

import { PlaceSearch } from './place-search';

type Props = {
  visible: boolean;
  onClose: () => void;
  sensing: SensingApi;
};

function Choice({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      containerStyle={styles.choiceContainer}
      fill
      haptic="select"
      onPress={onPress}
      pressedOpacity={0.6}
      scaleTo={1}
      style={styles.choice}
      testID={testID}>
      <AppText numberOfLines={1} style={styles.choiceLabel} variant={selected ? 'button' : 'body'}>
        {label}
      </AppText>
      {selected ? <Icon name="checkmark" size={18} tone="primary" /> : null}
    </PressableScale>
  );
}

/**
 * The presenter's sheet, opened by a long press on "Set the scene" and by
 * nothing else. It swaps what the phone senses for a prepared scenario, or
 * for a place found by name, so the app can be shown from a stage. "Automatic"
 * hands everything back to the device.
 *
 * testIDs: `scene-demo-sheet`, `scene-demo-automatic`, `scene-demo-<id>`,
 * `scene-demo-close`.
 */
export function DemoSheet({ visible, onClose, sensing }: Props) {
  const insets = useSafeAreaInsets();
  const { demo } = sensing;

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={styles.backdrop} />
        <View
          style={[styles.sheet, shadows.raised, { paddingBottom: insets.bottom + space.lg }]}
          testID="scene-demo-sheet">
          <View style={styles.header}>
            <AppText accessibilityRole="header" style={styles.title} variant="wordmark">
              Demo scenes
            </AppText>
            <PillButton label="Done" onPress={onClose} size="sm" testID="scene-demo-close" />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scroll}>
            <View accessibilityRole="radiogroup">
              <Choice
                label="Automatic"
                onPress={() => demo.choose(null)}
                selected={demo.activeId === null}
                testID="scene-demo-automatic"
              />
              {demo.scenarios.map((scenario) => (
                <Fragment key={scenario.id}>
                  <Divider />
                  <Choice
                    label={scenario.label}
                    onPress={() => demo.choose(scenario.id)}
                    selected={demo.activeId === scenario.id}
                    testID={`scene-demo-${scenario.id}`}
                  />
                </Fragment>
              ))}
            </View>
            <AppText style={styles.section} tone="muted" variant="meta">
              Place
            </AppText>
            <PlaceSearch sensing={sensing} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    maxHeight: '82%',
    paddingTop: space.lg,
    paddingHorizontal: space.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.paperRaised,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  title: {
    flex: 1,
  },
  scroll: {
    flexGrow: 0,
  },
  choiceContainer: {
    alignSelf: 'stretch',
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
  },
  choiceLabel: {
    flex: 1,
  },
  section: {
    marginTop: space.lg,
    marginBottom: space.xs,
  },
});

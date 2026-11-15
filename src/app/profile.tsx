import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useModalTopPadding } from '@/components/share/modal-insets';
import {
  AppText,
  Avatar,
  IconButton,
  Notice,
  PrimaryButton,
  Screen,
  haptics,
} from '@/components/ui';
import { useProfile } from '@/lib/score';
import { colors, layout, radius, space, typography } from '@/theme';

/** The server trims names to this many characters. */
const MAX_NAME = 24;

const EMOJI_CHOICES = ['🎬', '🎧', '🌙', '🌅', '☕', '🌧️', '🦦', '🦊', '🐺', '🌲', '🚲', '🛹', '🎹', '🎻', '🍿', '✨'];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/feed');
}

/** Edit your own name and emoji: the credit that appears on your share card. Opened as a modal. */
export default function ProfileScreen() {
  const { profile, update } = useProfile();
  const topPadding = useModalTopPadding();

  // Null means "not edited yet": show whatever the profile says.
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftEmoji, setDraftEmoji] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = draftName ?? profile?.displayName ?? '';
  const emoji = draftEmoji ?? profile?.avatarEmoji ?? EMOJI_CHOICES[0];
  const trimmed = name.trim();
  // The profile's own emoji is always offered, even when it is not in the list.
  const choices =
    profile && !EMOJI_CHOICES.includes(profile.avatarEmoji)
      ? [profile.avatarEmoji, ...EMOJI_CHOICES.slice(0, -1)]
      : EMOJI_CHOICES;

  const save = async () => {
    if (trimmed.length === 0) {
      setError('Give yourself a name first.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await update({ displayName: trimmed, avatarEmoji: emoji });
      haptics.success();
      close();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error && cause.message ? cause.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      contentStyle={[styles.content, { paddingTop: topPadding }]}
      edges="bottom"
      scroll
      testID="profile-screen">
      <View style={styles.topBar}>
        <AppText variant="overline">Your credit</AppText>
        <IconButton
          accessibilityLabel="Close"
          icon="close"
          onPress={close}
          size="sm"
          testID="profile-close"
        />
      </View>

      <View style={styles.preview}>
        <Avatar emoji={emoji} size={72} />
        <AppText align="center" numberOfLines={2} tone="secondary" variant="serifItalic">
          Scored for {trimmed || '…'}
        </AppText>
      </View>

      <View style={styles.field}>
        <AppText nativeID="profile-name-label" variant="overline">
          Display name
        </AppText>
        <TextInput
          accessibilityLabel="Display name"
          accessibilityLabelledBy="profile-name-label"
          autoCapitalize="words"
          autoCorrect={false}
          keyboardAppearance="dark"
          maxLength={MAX_NAME}
          onChangeText={(value) => {
            setDraftName(value);
            setError(null);
          }}
          onSubmitEditing={save}
          placeholder="Quiet Otter"
          placeholderTextColor={colors.textDisabled}
          returnKeyType="done"
          selectionColor={colors.accent}
          style={styles.input}
          testID="profile-name"
          value={name}
        />
      </View>

      <View style={styles.field}>
        <AppText variant="overline">Emoji</AppText>
        <View accessibilityRole="radiogroup" style={styles.emojiGrid}>
          {choices.map((choice, index) => {
            const selected = choice === emoji;
            return (
              <Pressable
                accessibilityLabel={`Emoji ${choice}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={choice}
                onPress={() => {
                  haptics.select();
                  setDraftEmoji(choice);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.emoji,
                  selected ? styles.emojiSelected : null,
                  pressed ? styles.emojiPressed : null,
                ]}
                testID={`profile-emoji-${index + 1}`}>
                <Text allowFontScaling={false} style={styles.emojiGlyph}>
                  {choice}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Notice message={error} testID="profile-error" title="Not saved" tone="error" /> : null}

      <PrimaryButton
        fullWidth
        icon="checkmark"
        label="Save"
        loading={saving}
        onPress={save}
        size="md"
        testID="profile-save"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space.xl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preview: {
    alignItems: 'center',
    gap: space.md,
  },
  field: {
    gap: space.sm,
  },
  input: {
    ...typography.title,
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: layout.hairline,
    borderColor: colors.hairlineStrong,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  emoji: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: layout.hairline,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  emojiSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  emojiPressed: {
    backgroundColor: colors.surfacePressed,
  },
  emojiGlyph: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
    color: colors.text,
  },
});

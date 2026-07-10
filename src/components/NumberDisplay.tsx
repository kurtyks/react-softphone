import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { dialedNumber } from '@/lib/stores';
import { useStore } from '@/lib/useStore';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';

/**
 * Editable dialed-number field. It is a real TextInput so you can type ANY characters
 * (digits, letters, `@`, `.`, `*`, `#` — e.g. a full SIP URI), not just what the dialpad
 * emits. Bound to the `dialedNumber` store, so the on-screen dialpad and typing share one
 * source of truth. `onSubmit` fires on Enter.
 */
const SIDE = 36; // matched left spacer / right backspace width → keeps text centred

export function NumberDisplay({ onSubmit }: { onSubmit?: () => void }) {
  const dialed = useStore(dialedNumber);

  const len = dialed.length;
  // Empty → small placeholder; while typing, scale the value down as it grows.
  const fontSize = len === 0 ? 15 : len > 22 ? 18 : len > 16 ? 22 : len > 11 ? 26 : 30;

  return (
    <View style={styles.container}>
      <View style={styles.side} />
      <TextInput
        value={dialed}
        onChangeText={(v) => dialedNumber.set(v)}
        onSubmitEditing={onSubmit}
        // Enter dials, same as tapping the green handset. onSubmitEditing is flaky on
        // react-native-web, so also catch Enter via the key event.
        onKeyPress={(e) => {
          const ne = e.nativeEvent as { key?: string; preventDefault?: () => void };
          if (ne.key === 'Enter') {
            ne.preventDefault?.();
            onSubmit?.();
          }
        }}
        autoFocus={Platform.OS === 'web'}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder="Number or SIP URI"
        placeholderTextColor={colors.gray500}
        style={[styles.input, { fontSize }]}
      />
      <View style={styles.side}>
        {len > 0 && (
          <Pressable
            style={styles.backspace}
            onPress={() => dialedNumber.update((n) => n.slice(0, -1))}
          >
            <Icon name="delete-left" size={18} color={colors.gray400} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    height: 56, // fixed → the font-size change on typing never resizes the box
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray800,
    borderWidth: 1,
    borderColor: colors.gray700,
    borderRadius: radius.lg,
    paddingHorizontal: 4
  },
  input: {
    flex: 1,
    height: '100%',
    textAlign: 'center',
    color: colors.white,
    outlineWidth: 0
  },
  side: { width: SIDE, alignItems: 'center', justifyContent: 'center' },
  backspace: { padding: 9 }
});

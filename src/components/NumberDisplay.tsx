import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dialedNumber } from '@/lib/stores';
import { useStore } from '@/lib/useStore';
import { colors } from '@/theme';
import { Icon } from './Icon';

/** Shows the dialed number with a length-adaptive font size and a backspace button. */
export function NumberDisplay() {
  const dialed = useStore(dialedNumber);

  const len = dialed.length;
  const fontSize = len > 14 ? 20 : len > 11 ? 24 : len > 9 ? 30 : 36;

  return (
    <View style={styles.container}>
      <Text style={[styles.number, { fontSize }]} numberOfLines={1} ellipsizeMode="head">
        {dialed}
      </Text>
      {len > 0 && (
        <Pressable style={styles.backspace} onPress={() => dialedNumber.update((n) => n.slice(0, -1))}>
          <Icon name="delete-left" size={20} color={colors.gray500} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center'
  },
  number: {
    flex: 1,
    textAlign: 'right',
    color: colors.white,
    letterSpacing: 2,
    paddingVertical: 16,
    paddingRight: 8
  },
  backspace: { padding: 8 }
});

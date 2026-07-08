import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

/**
 * "Dumb" dialpad: emits the pressed key; the parent decides what to do
 * (dialer → append to number; in-call → send DTMF).
 */
const KEYS: { main: string; sub: string }[] = [
  { main: '1', sub: '' },
  { main: '2', sub: 'abc' },
  { main: '3', sub: 'def' },
  { main: '4', sub: 'ghi' },
  { main: '5', sub: 'jkl' },
  { main: '6', sub: 'mno' },
  { main: '7', sub: 'pqrs' },
  { main: '8', sub: 'tuv' },
  { main: '9', sub: 'wxyz' },
  { main: '*', sub: '' },
  { main: '0', sub: '+' },
  { main: '#', sub: '' }
];

export function Dialpad({ onKeyPress }: { onKeyPress: (key: string) => void }) {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => (
        <Pressable
          key={key.main}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          onPress={() => onKeyPress(key.main)}
        >
          <Text style={styles.main}>{key.main}</Text>
          {key.sub ? <Text style={styles.sub}>{key.sub}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    maxWidth: 320,
    alignSelf: 'center',
    width: '100%',
    rowGap: 16
  },
  key: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: colors.gray700,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyPressed: { backgroundColor: colors.gray600 },
  main: { fontSize: 30, fontWeight: '300', color: colors.white },
  sub: { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.gray400 }
});

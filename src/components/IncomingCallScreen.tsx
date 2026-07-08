import { Pressable, StyleSheet, Text, View } from 'react-native';
import { incomingCall } from '@/lib/stores';
import { answer, reject } from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';
import { useT } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';

/** Full-screen overlay shown while a call is ringing in. */
export function IncomingCallScreen() {
  const t = useT();
  const incoming = useStore(incomingCall);
  if (!incoming) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.info}>
        <Text style={styles.label}>{t('incoming.from')}</Text>
        <Text style={styles.caller}>{incoming.caller}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.reject]} onPress={reject}>
          <Icon name="phone-slash" size={28} color={colors.white} />
        </Pressable>
        <Pressable style={[styles.button, styles.accept]} onPress={answer}>
          <Icon name="phone" size={28} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: 16
  },
  info: { alignItems: 'center', gap: 16 },
  label: { color: colors.gray400, fontSize: 18 },
  caller: { color: colors.white, fontSize: 44, fontWeight: 'bold' },
  actions: { flexDirection: 'row', gap: 32, marginTop: 64 },
  button: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center'
  },
  reject: { backgroundColor: colors.red500 },
  accept: { backgroundColor: colors.green500 }
});

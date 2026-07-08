import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { profiles, activeProfileId, setActiveProfile } from '@/lib/profiles';
import { connect, disconnect, wsState, registrationState } from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';
import { Select } from './Select';

/** Registration status dot + profile picker + connect/disconnect + edit link. */
export function ProfileSwitcher() {
  const router = useRouter();
  const list = useStore(profiles);
  const activeId = useStore(activeProfileId);
  const ws = useStore(wsState);
  const reg = useStore(registrationState);

  const connected = ws !== 'disconnected';
  const dotColor =
    reg === 'registered'
      ? colors.green500
      : reg === 'registering' || reg === 'failed'
        ? colors.yellow500
        : colors.gray600;

  // Switching the profile immediately reconnects so the change takes effect.
  function onSelect(id: string) {
    setActiveProfile(id);
    connect();
  }

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.select}>
        <Select
          value={activeId ?? ''}
          ariaLabel="Profil"
          onValueChange={onSelect}
          options={list.map((p) => ({ value: p.id, label: p.name }))}
        />
      </View>
      {connected ? (
        <Pressable style={styles.iconBtn} onPress={disconnect}>
          <Icon name="link-slash" size={16} color={colors.gray300} />
        </Pressable>
      ) : (
        <Pressable style={[styles.iconBtn, styles.connectBtn]} onPress={connect}>
          <Icon name="link" size={16} color={colors.white} />
        </Pressable>
      )}
      <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')}>
        <Icon name="pen" size={16} color={colors.gray300} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: radius.full },
  select: { flex: 1, minWidth: 0 },
  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.gray700,
    borderRadius: radius.md
  },
  connectBtn: { backgroundColor: colors.blue600 }
});

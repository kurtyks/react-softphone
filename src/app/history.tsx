import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { callHistory } from '@/lib/stores';
import { useStore } from '@/lib/useStore';
import { useT } from '@/lib/i18n';
import { colors, radius } from '@/theme';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function iconFor(type: 'incoming' | 'outgoing' | 'missed'): string {
  return type === 'missed' ? 'phone-slash' : 'phone-alt';
}

function colorFor(type: 'incoming' | 'outgoing' | 'missed'): string {
  switch (type) {
    case 'incoming':
      return colors.green500;
    case 'outgoing':
      return colors.blue500;
    case 'missed':
      return colors.red500;
    default:
      return colors.gray400;
  }
}

export default function HistoryScreen() {
  const router = useRouter();
  const t = useT();
  const history = useStore(callHistory);
  const sorted = [...history].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.push('/')}>
          <Icon name="arrow-left" size={20} color={colors.gray400} />
        </Pressable>
        <Text style={styles.title}>{t('history.title')}</Text>
      </View>

      {sorted.length === 0 ? (
        <Text style={styles.empty}>{t('history.empty')}</Text>
      ) : (
        <View style={styles.list}>
          {sorted.map((call) => (
            <View key={call.id} style={styles.item}>
              <Icon name={iconFor(call.type)} size={20} color={colorFor(call.type)} />
              <View style={styles.itemBody}>
                <Text style={styles.number}>{call.number}</Text>
                <Text style={styles.time}>{new Date(call.time).toLocaleString()}</Text>
              </View>
              <Text style={styles.time}>{formatDuration(call.duration)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: 16, maxWidth: 448, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32 },
  back: { padding: 8, marginRight: 8, marginLeft: -8 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.white },
  empty: { textAlign: 'center', color: colors.gray400 },
  list: { gap: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.gray800,
    borderRadius: radius.lg,
    gap: 16
  },
  itemBody: { flex: 1 },
  number: { fontSize: 18, fontWeight: '600', color: colors.white },
  time: { fontSize: 13, color: colors.gray400 }
});

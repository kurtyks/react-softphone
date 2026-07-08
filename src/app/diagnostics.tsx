import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { Icon } from '@/components/Icon';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { useT } from '@/lib/i18n';
import { colors } from '@/theme';

export default function DiagnosticsScreen() {
  const router = useRouter();
  const t = useT();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.push('/')}>
          <Icon name="arrow-left" size={20} color={colors.gray400} />
        </Pressable>
        <Text style={styles.title}>{t('diag.title')}</Text>
      </View>
      <View style={styles.switcher}>
        <ProfileSwitcher />
      </View>
      <DiagnosticsPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: 16, maxWidth: 448, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  back: { padding: 8, marginRight: 8, marginLeft: -8 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.white },
  switcher: { marginBottom: 16 }
});

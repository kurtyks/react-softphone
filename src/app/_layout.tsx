import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { NotificationDisplay } from '@/components/NotificationDisplay';
import { RemoteAudio } from '@/components/RemoteAudio';
import { checkMediaPermissions } from '@/lib/mediaService';
import { initProfiles } from '@/lib/profiles';
import { autoConnect } from '@/lib/sip/softphone';
import { colors } from '@/theme';

export default function RootLayout() {
  // One-time startup: probe the mic permission (WITHOUT capturing — the mic is only
  // acquired for the duration of a call), then init profiles and auto-connect.
  useEffect(() => {
    (async () => {
      await checkMediaPermissions();
      initProfiles();
      autoConnect();
    })();
  }, []);

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.black }
        }}
      />
      {/* Global, persistent across route changes. */}
      <RemoteAudio />
      <NotificationDisplay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.black }
});

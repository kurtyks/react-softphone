import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native';

import { CallView } from '@/components/CallView';
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { Dialpad } from '@/components/Dialpad';
import { Icon } from '@/components/Icon';
import { IncomingCallScreen } from '@/components/IncomingCallScreen';
import { NumberDisplay } from '@/components/NumberDisplay';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';
import { Select } from '@/components/Select';
import { get } from '@/lib/store';
import { dialedNumber, isDialpadVisible, callState } from '@/lib/stores';
import {
  mediaPermissionStatus,
  requestMediaPermissions,
  releaseLocalStream,
  enumerateMicrophones,
  availableMicrophones,
  selectedMicrophoneId
} from '@/lib/mediaService';
import { addNotification } from '@/lib/notifications';
import { activeProfile } from '@/lib/profiles';
import { makeCall, registrationState, wsState } from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';
import { useT } from '@/lib/i18n';
import { colors, radius } from '@/theme';

const VALID_KEYS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];

export default function HomeScreen() {
  const router = useRouter();
  const t = useT();
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const state = useStore(callState);
  const dialpadVisible = useStore(isDialpadVisible);
  const micStatus = useStore(mediaPermissionStatus);
  const mics = useStore(availableMicrophones);
  const selectedMic = useStore(selectedMicrophoneId);

  // Grant the mic permission on demand, then release it again while idle — we only
  // capture the microphone for the duration of a call.
  async function allowMic() {
    const ok = await requestMediaPermissions(get(selectedMicrophoneId));
    if (ok) {
      await enumerateMicrophones();
      if (get(callState) === 'idle') releaseLocalStream();
    }
  }

  function startCall() {
    const dialed = get(dialedNumber);
    if (dialed.length === 0) return;

    const profile = get(activeProfile);
    const registered = get(registrationState) === 'registered';
    // Unregistered profiles (e.g. IP-authenticated trunk) only need a live WS link.
    const canCallUnregistered = !!profile && !profile.register && get(wsState) === 'connected';

    if (!registered && !canCallUnregistered) {
      addNotification(
        profile && !profile.register ? t('home.warn.noWs') : t('home.warn.notRegistered'),
        'warning'
      );
      return;
    }

    isDialpadVisible.set(false);
    makeCall(dialed);
  }

  // Physical-keyboard dialing (web only).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKeyDown(e: KeyboardEvent) {
      if (get(callState) !== 'idle') return;
      if (VALID_KEYS.includes(e.key)) {
        e.preventDefault();
        dialedNumber.update((n) => n + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        dialedNumber.update((n) => n.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startCall();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.mainColumn}>
        <IncomingCallScreen />

        {state === 'idle' ? (
          <>
            <View style={styles.headerRow}>
              <View style={styles.navLinks}>
                <Pressable style={styles.navBtn} onPress={() => router.push('/settings')}>
                  <Icon name="gear" size={20} color={colors.gray400} />
                </Pressable>
                <Pressable style={styles.navBtn} onPress={() => router.push('/history')}>
                  <Icon name="history" size={20} color={colors.gray400} />
                </Pressable>
              </View>
              <View style={styles.headerRight}>
                <MicStatus status={micStatus} onAllow={allowMic} />
                {!wide && (
                  <Pressable
                    style={styles.diagBtn}
                    onPress={() => router.push('/diagnostics')}
                  >
                    <Icon name="wave-square" size={18} color={colors.white} />
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.switcher}>
              <ProfileSwitcher />
            </View>

            <View style={styles.dialerBody}>
              <NumberDisplay />
            </View>

            <View style={styles.footer}>
              {mics.length > 1 && micStatus === 'granted' && (
                <View style={styles.micSelect}>
                  <Select
                    value={selectedMic ?? ''}
                    onValueChange={(id) => {
                      selectedMicrophoneId.set(id);
                      if (get(mediaPermissionStatus) === 'granted') requestMediaPermissions(id);
                    }}
                    options={mics.map((m) => ({
                      value: m.deviceId,
                      label: m.label || t('home.mic.fallback', { id: m.deviceId.substring(0, 4) })
                    }))}
                  />
                </View>
              )}

              {dialpadVisible && (
                <View style={styles.dialpadWrap}>
                  <Dialpad onKeyPress={(k) => dialedNumber.update((n) => n + k)} />
                </View>
              )}

              <View style={styles.callRow}>
                <Pressable style={styles.callBtn} onPress={startCall}>
                  <Icon name="phone" size={28} color={colors.white} />
                </Pressable>
                <Pressable
                  style={styles.toggleBtn}
                  onPress={() => isDialpadVisible.update((v) => !v)}
                >
                  <Icon
                    name={dialpadVisible ? 'chevron-down' : 'keyboard'}
                    size={20}
                    color={colors.white}
                  />
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <CallView />
        )}
      </View>

      {wide && (
        <View style={styles.sidebar}>
          <View style={styles.sidebarHeader}>
            <Icon name="wave-square" size={18} color={colors.white} />
            <Text style={styles.sidebarTitle}>{t('home.diagnostics')}</Text>
          </View>
          <ScrollView>
            <DiagnosticsPanel />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function MicStatus({ status, onAllow }: { status: string; onAllow: () => void }) {
  const t = useT();
  // Granted: static indicator only — the mic is NOT captured while idle, it is
  // acquired per call, so there is no live level meter here.
  if (status === 'granted') {
    return (
      <View style={styles.micStatus}>
        <Icon name="microphone" size={18} color={colors.green500} />
        <Text style={styles.micReady}>{t('home.mic.ready')}</Text>
      </View>
    );
  }
  if (status === 'denied') {
    return <Text style={styles.micDenied}>{t('home.mic.blocked')}</Text>;
  }
  return (
    <Pressable style={styles.micAllow} onPress={onAllow}>
      <Text style={styles.micAllowText}>{t('home.mic.allow')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, flexDirection: 'row' },
  mainColumn: { flex: 1, minWidth: 0, padding: 16 },
  headerRow: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  navLinks: { flexDirection: 'row', alignItems: 'center' },
  navBtn: { padding: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  diagBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.gray700,
    borderRadius: radius.md
  },
  micStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  micReady: { color: colors.gray400, fontSize: 13 },
  micDenied: { color: colors.red500, fontSize: 13 },
  micAllow: {
    backgroundColor: colors.blue500,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.md
  },
  micAllowText: { color: colors.white, fontSize: 13 },
  switcher: { paddingVertical: 8 },
  dialerBody: { flex: 1, justifyContent: 'center' },
  footer: { alignItems: 'center', gap: 16, paddingBottom: 16 },
  micSelect: { width: '100%', maxWidth: 320 },
  dialpadWrap: { width: '100%' },
  callRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
  callBtn: {
    width: 80,
    height: 80,
    backgroundColor: colors.green500,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toggleBtn: {
    width: 64,
    height: 64,
    backgroundColor: colors.gray700,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sidebar: {
    width: 384,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: colors.gray800,
    backgroundColor: 'rgba(17,24,39,0.4)',
    padding: 16
  },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sidebarTitle: { fontSize: 18, fontWeight: 'bold', color: colors.white }
});

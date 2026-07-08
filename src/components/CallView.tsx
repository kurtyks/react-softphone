import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  dialedNumber,
  callState,
  isMuted,
  isHeld,
  callDuration,
  callHistory,
  isTransferring,
  transferTargetNumber
} from '@/lib/stores';
import {
  hangup,
  toggleMute,
  toggleHold,
  sendDtmf,
  transfer as sipTransfer,
  activeCall
} from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';
import { useT } from '@/lib/i18n';
import { colors, radius } from '@/theme';
import { Icon } from './Icon';
import { Dialpad } from './Dialpad';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

/** Active-call screen: talk timer, mute/hold, in-call DTMF dialpad, blind transfer, hangup. */
export function CallView() {
  const t = useT();
  const call = useStore(activeCall);
  const dialed = useStore(dialedNumber);
  const state = useStore(callState);
  const muted = useStore(isMuted);
  const held = useStore(isHeld);
  const duration = useStore(callDuration);
  const transferring = useStore(isTransferring);
  const transferTarget = useStore(transferTargetNumber);

  const [dialpadInCall, setDialpadInCall] = useState(false);

  // Reset the timer when the call view mounts.
  useEffect(() => {
    callDuration.set(0);
  }, []);

  // Tick the timer while in-call and not on hold.
  useEffect(() => {
    if (state !== 'in-call' || held) return;
    const t = setInterval(() => callDuration.update((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [state, held]);

  function endCall() {
    callHistory.update((history) => [
      ...history,
      {
        id: Date.now().toString(),
        type: call?.direction ?? 'outgoing',
        number: call?.remoteIdentity ?? dialed,
        time: new Date(),
        duration
      }
    ]);
    hangup();
    dialedNumber.set('');
    isMuted.set(false);
    isHeld.set(false);
    isTransferring.set(false);
    transferTargetNumber.set('');
  }

  function confirmTransfer() {
    if (transferTarget) {
      sipTransfer(transferTarget);
      endCall();
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.remote}>{call?.remoteIdentity ?? dialed}</Text>
        {held ? (
          <Text style={styles.held}>{t('call.held')}</Text>
        ) : (
          <Text style={styles.duration}>{formatTime(duration)}</Text>
        )}
      </View>

      <View style={styles.middle}>
        {dialpadInCall ? (
          <Dialpad onKeyPress={(k) => sendDtmf(k)} />
        ) : transferring ? (
          <View style={styles.transferBox}>
            <Text style={styles.transferTitle}>{t('call.transfer.title')}</Text>
            <TextInput
              value={transferTarget}
              onChangeText={(v) => transferTargetNumber.set(v)}
              placeholder={t('call.transfer.target')}
              placeholderTextColor={colors.gray500}
              style={styles.input}
            />
            <View style={styles.transferActions}>
              <Pressable
                style={[styles.transferBtn, { backgroundColor: colors.gray600 }]}
                onPress={() => {
                  isTransferring.set(false);
                  transferTargetNumber.set('');
                }}
              >
                <Text style={styles.transferBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.transferBtn, { backgroundColor: colors.blue600 }]}
                onPress={confirmTransfer}
              >
                <Text style={styles.transferBtnText}>{t('call.transfer')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <ControlButton
          active={muted}
          icon={muted ? 'microphone' : 'microphone-slash'}
          label={muted ? t('call.unmute') : t('call.mute')}
          onPress={toggleMute}
        />
        <ControlButton
          active={dialpadInCall}
          icon="keyboard"
          label={t('call.keypad')}
          onPress={() => setDialpadInCall((v) => !v)}
        />
        <ControlButton
          active={held}
          icon={held ? 'play' : 'pause'}
          label={held ? t('call.resume') : t('call.hold')}
          onPress={toggleHold}
        />
        <ControlButton
          active={false}
          icon="exchange-alt"
          label={t('call.transfer')}
          onPress={() => isTransferring.set(true)}
        />
      </View>

      <View style={styles.hangupRow}>
        <Pressable style={styles.hangup} onPress={endCall}>
          <Icon name="phone-slash" size={28} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

function ControlButton({
  active,
  icon,
  label,
  onPress
}: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.control, { backgroundColor: active ? colors.blue500 : colors.gray700 }]}
      onPress={onPress}
    >
      <Icon name={icon} size={24} color={colors.white} />
      <Text style={styles.controlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'space-between' },
  header: { alignItems: 'center', paddingTop: 64, gap: 4 },
  remote: { fontSize: 30, color: colors.white },
  held: { color: colors.yellow400, fontWeight: '600' },
  duration: { color: colors.gray400 },
  middle: { width: '100%', maxWidth: 320 },
  transferBox: { padding: 16, backgroundColor: colors.gray800, borderRadius: radius.lg, gap: 16 },
  transferTitle: { fontSize: 18, fontWeight: '600', color: colors.white },
  input: {
    width: '100%',
    backgroundColor: colors.gray700,
    color: colors.white,
    borderRadius: radius.md,
    padding: 8
  },
  transferActions: { flexDirection: 'row', gap: 8 },
  transferBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md, alignItems: 'center' },
  transferBtnText: { color: colors.white },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    rowGap: 16
  },
  control: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  controlLabel: { fontSize: 11, color: colors.white },
  hangupRow: { paddingBottom: 32 },
  hangup: {
    width: 80,
    height: 80,
    backgroundColor: colors.red500,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

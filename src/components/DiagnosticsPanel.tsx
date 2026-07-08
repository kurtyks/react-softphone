import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { activeProfile } from '@/lib/profiles';
import { diagnostics, registrationState, wsState } from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';
import { useT } from '@/lib/i18n';
import { colors, mono, radius } from '@/theme';

function fmtTime(at: number): string {
  const d = new Date(at);
  return (
    d.toLocaleTimeString('pl-PL', { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

function levelColor(level: string): string {
  switch (level) {
    case 'success':
      return colors.green400;
    case 'warning':
      return colors.yellow400;
    case 'error':
      return colors.red400;
    default:
      return colors.gray300;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Badge({ text, ok, warn }: { text: string; ok: boolean; warn?: boolean }) {
  const bg = warn ? colors.yellow700 : ok ? colors.green700 : colors.gray700;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

/** Live SIP/WebRTC diagnostics: connection, ICE path, RTP metrics and an event log. */
export function DiagnosticsPanel() {
  const t = useT();
  const profile = useStore(activeProfile);
  const diag = useStore(diagnostics);
  const ws = useStore(wsState);
  const reg = useStore(registrationState);
  const rtp = diag.rtp;

  return (
    <View style={styles.wrap}>
      <View style={styles.section}>
        <Row label={t('diag.profile')}>
          <Text style={styles.value}>{profile?.name ?? '—'}</Text>
        </Row>
        <Row label={t('diag.icePolicy')}>
          <Text style={styles.valueMono}>{profile?.iceTransportPolicy ?? '—'}</Text>
        </Row>
        <Row label={t('diag.websocket')}>
          <Badge text={ws} ok={ws === 'connected'} warn={ws === 'connecting'} />
        </Row>
        <Row label={t('diag.registration')}>
          <Badge text={reg} ok={reg === 'registered'} warn={reg === 'registering'} />
        </Row>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t('diag.webrtcIce')}</Text>
        <Row label={t('diag.iceConnection')}>
          <Text style={styles.valueMono}>{diag.iceConnectionState}</Text>
        </Row>
        <Row label={t('diag.iceGathering')}>
          <Text style={styles.valueMono}>{diag.iceGatheringState}</Text>
        </Row>
        <Row label={t('diag.mediaPath')}>
          <Text
            style={[styles.value, diag.candidatePairType === 'relay' && { color: colors.green400 }]}
          >
            {t(`cand.${diag.candidatePairType}`)}
          </Text>
        </Row>
        <View style={styles.row}>
          <Text style={styles.subtle}>
            {t('diag.localCandidate', { t: diag.localCandidateType })}
          </Text>
          <Text style={styles.subtle}>
            {t('diag.remoteCandidate', { t: diag.remoteCandidateType })}
          </Text>
        </View>
        <Row label={t('diag.iceRestart')}>
          <Text style={styles.value}>
            {diag.iceRestartCount}×
            {diag.lastIceRestartAt
              ? `  ${t('diag.iceRestartLast', { t: fmtTime(diag.lastIceRestartAt) })}`
              : ''}
          </Text>
        </Row>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t('diag.rtpAudio')}</Text>
        <Row label={t('diag.codec')}>
          <Text style={styles.valueMono}>{rtp.codec}</Text>
        </Row>
        <Row label={t('diag.jitter')}>
          <Text style={[styles.valueMono, rtp.jitterMs > 30 && { color: colors.yellow400 }]}>
            {rtp.jitterMs} ms
          </Text>
        </Row>
        <Row label={t('diag.packetsLost')}>
          <Text
            style={[
              styles.valueMono,
              rtp.packetLossPct > 1 && rtp.packetLossPct <= 5 && { color: colors.yellow400 },
              rtp.packetLossPct > 5 && { color: colors.red400 }
            ]}
          >
            {rtp.packetLossPct}% ({rtp.packetsLost})
          </Text>
        </Row>
        <Row label={t('diag.rtt')}>
          <Text style={[styles.valueMono, rtp.rttMs > 250 && { color: colors.yellow400 }]}>
            {rtp.rttMs} ms
          </Text>
        </Row>
        <Row label={t('diag.inbound')}>
          <Text style={styles.valueMono}>{rtp.inboundKbps} kbps</Text>
        </Row>
        <Row label={t('diag.outbound')}>
          <Text style={styles.valueMono}>{rtp.outboundKbps} kbps</Text>
        </Row>
      </View>

      <View style={styles.section}>
        <Text style={styles.heading}>{t('diag.eventLog')}</Text>
        <ScrollView style={styles.log}>
          {diag.log.length === 0 ? (
            <Text style={styles.subtle}>{t('diag.noEvents')}</Text>
          ) : (
            [...diag.log].reverse().map((entry, i) => (
              <Text key={`${entry.at}-${i}`} style={[styles.logLine, { color: levelColor(entry.level) }]}>
                <Text style={styles.logTime}>{fmtTime(entry.at)} </Text>
                {entry.message}
              </Text>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  section: { gap: 8, padding: 16, backgroundColor: colors.gray800, borderRadius: radius.lg },
  heading: { color: colors.white, fontWeight: '600', fontSize: 14, marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: colors.gray400, fontSize: 13 },
  value: { color: colors.white, fontSize: 13 },
  valueMono: { color: colors.white, fontSize: 13, fontFamily: mono },
  subtle: { color: colors.gray500, fontSize: 11 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.md },
  badgeText: { color: colors.white, fontSize: 11 },
  log: { maxHeight: 320 },
  logLine: { fontFamily: mono, fontSize: 11, marginBottom: 2 },
  logTime: { color: colors.gray600 }
});

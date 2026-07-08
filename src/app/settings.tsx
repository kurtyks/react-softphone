import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Checkbox } from '@/components/Checkbox';
import { Icon } from '@/components/Icon';
import { Select } from '@/components/Select';
import {
  profiles,
  activeProfileId,
  addProfile,
  duplicateProfile,
  deleteProfile,
  updateProfile,
  setActiveProfile,
  initProfiles
} from '@/lib/profiles';
import { connect, registrationState, wsState } from '@/lib/sip/softphone';
import type { IceServerConfig, SipProfile } from '@/lib/sip/types';
import { useStore } from '@/lib/useStore';
import { language, useT, type Language } from '@/lib/i18n';
import { colors, radius } from '@/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const t = useT();
  const lang = useStore(language);
  const list = useStore(profiles);
  const activeId = useStore(activeProfileId);
  const reg = useStore(registrationState);
  const ws = useStore(wsState);

  const [form, setForm] = useState<SipProfile | null>(null);
  const [wsText, setWsText] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const loadedId = useRef<string | null>(null);

  useEffect(() => initProfiles(), []);

  // Load the selected profile into an editable copy when the active profile changes.
  useEffect(() => {
    const p = list.find((x) => x.id === activeId) ?? list[0] ?? null;
    if (p && p.id !== loadedId.current) {
      setForm(structuredClone(p));
      setWsText(p.wsServers.join('\n'));
      loadedId.current = p.id;
    }
    if (!p) {
      setForm(null);
      loadedId.current = null;
    }
  }, [activeId, list]);

  function patch(p: Partial<SipProfile>) {
    setForm((f) => (f ? { ...f, ...p } : f));
  }
  function patchSmart(p: Partial<SipProfile['smart']>) {
    setForm((f) => (f ? { ...f, smart: { ...f.smart, ...p } } : f));
  }
  function patchIce(i: number, p: Partial<IceServerConfig>) {
    setForm((f) =>
      f ? { ...f, iceServers: f.iceServers.map((s, idx) => (idx === i ? { ...s, ...p } : s)) } : f
    );
  }

  function save() {
    if (!form) return;
    const wsServers = wsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = { ...form, wsServers };
    setForm(next);
    updateProfile(form.id, next);
  }

  function saveAndConnect() {
    save();
    connect();
  }

  const regBadge =
    reg === 'registered'
      ? colors.green700
      : reg === 'registering'
        ? colors.yellow700
        : reg === 'failed'
          ? colors.red700
          : colors.gray700;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.push('/')}>
          <Icon name="arrow-left" size={20} color={colors.gray400} />
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <View style={[styles.statusPill, { backgroundColor: regBadge }]}>
          <Text style={styles.statusText}>
            WS: {ws} · {reg}
          </Text>
        </View>
      </View>

      {/* Language + profile management */}
      <View style={styles.card}>
        <Field label={t('settings.language')}>
          <Select
            value={lang}
            onValueChange={(v) => language.set(v as Language)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'pl', label: 'Polski' }
            ]}
          />
        </Field>
        <Text style={styles.fieldLabel}>{t('settings.accountProfile')}</Text>
        <Select
          value={activeId ?? ''}
          onValueChange={setActiveProfile}
          options={list.map((p) => ({ value: p.id, label: p.name }))}
        />
        <View style={styles.profileBtns}>
          <ProfileBtn icon="plus" label={t('settings.new')} onPress={() => addProfile()} />
          <ProfileBtn
            icon="copy"
            label={t('settings.duplicate')}
            onPress={() => form && duplicateProfile(form.id)}
          />
          <ProfileBtn
            icon="trash"
            label={t('settings.delete')}
            disabled={list.length <= 1}
            onPress={() => {
              if (form) {
                deleteProfile(form.id);
                loadedId.current = null;
              }
            }}
          />
        </View>
      </View>

      {form && (
        <View style={styles.formWrap}>
          <Field label={t('settings.profileName')}>
            <TextInput style={styles.input} value={form.name} onChangeText={(v) => patch({ name: v })} />
          </Field>

          {/* SIP account */}
          <Section icon="address-card" title={t('settings.sip')} subtitle={t('settings.sipSub')}>
            <Field label={t('settings.uri')}>
              <TextInput
                style={styles.input}
                value={form.uri}
                autoCapitalize="none"
                placeholder="sip:user@domain.com"
                placeholderTextColor={colors.gray500}
                onChangeText={(v) => patch({ uri: v })}
              />
            </Field>
            <Field label={t('settings.password')}>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={form.password}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  onChangeText={(v) => patch({ password: v })}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPassword((s) => !s)}>
                  <Icon name={showPassword ? 'eye-slash' : 'eye'} size={16} color={colors.gray400} />
                </Pressable>
              </View>
            </Field>
            <Field label={t('settings.authUser')}>
              <TextInput
                style={styles.input}
                value={form.authorizationUser}
                autoCapitalize="none"
                placeholder={t('settings.authUserPh')}
                placeholderTextColor={colors.gray500}
                onChangeText={(v) => patch({ authorizationUser: v })}
              />
            </Field>
            <Field label={t('settings.displayName')}>
              <TextInput
                style={styles.input}
                value={form.displayName}
                onChangeText={(v) => patch({ displayName: v })}
              />
            </Field>
            <Checkbox
              checked={form.register}
              onChange={(v) => patch({ register: v })}
              label={t('settings.register')}
            />

            <Collapsible title={t('settings.advSip')}>
              <Field label={t('settings.registrar')}>
                <TextInput
                  style={styles.input}
                  value={form.registrarServer}
                  autoCapitalize="none"
                  placeholder="sip:domain.com"
                  placeholderTextColor={colors.gray500}
                  onChangeText={(v) => patch({ registrarServer: v })}
                />
              </Field>
              <Field label={t('settings.registerExpires')}>
                <NumberInput value={form.registerExpires} onChange={(n) => patch({ registerExpires: n })} />
              </Field>
              <Field label={t('settings.dtmfMode')}>
                <Select
                  value={form.dtmfMode}
                  onValueChange={(v) => patch({ dtmfMode: v as SipProfile['dtmfMode'] })}
                  options={[
                    { value: 'RFC2833', label: t('settings.dtmf.rfc2833') },
                    { value: 'INFO', label: t('settings.dtmf.info') }
                  ]}
                />
              </Field>
              <Checkbox
                checked={form.sessionTimers}
                onChange={(v) => patch({ sessionTimers: v })}
                label={t('settings.sessionTimers')}
              />
              <Field label={t('settings.noAnswer')}>
                <NumberInput value={form.noAnswerTimeout} onChange={(n) => patch({ noAnswerTimeout: n })} />
              </Field>
              <Field label={t('settings.userAgent')}>
                <TextInput
                  style={styles.input}
                  value={form.userAgent}
                  onChangeText={(v) => patch({ userAgent: v })}
                />
              </Field>
            </Collapsible>
          </Section>

          {/* Transport / WebRTC */}
          <Section
            icon="network-wired"
            title={t('settings.transport')}
            subtitle={t('settings.transportSub')}
          >
            <Field label={t('settings.wsServers')}>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={wsText}
                multiline
                autoCapitalize="none"
                placeholder="wss://sip.example.com:8089/ws"
                placeholderTextColor={colors.gray500}
                onChangeText={setWsText}
              />
            </Field>
            <Field label={t('settings.icePolicy')}>
              <Select
                value={form.iceTransportPolicy}
                onValueChange={(v) =>
                  patch({ iceTransportPolicy: v as SipProfile['iceTransportPolicy'] })
                }
                options={[
                  { value: 'all', label: t('settings.icePolicy.all') },
                  { value: 'relay', label: t('settings.icePolicy.relay') }
                ]}
              />
            </Field>

            <Text style={styles.fieldLabel}>{t('settings.iceServers')}</Text>
            {form.iceServers.map((server, i) => (
              <View key={i} style={styles.iceRow}>
                <View style={styles.iceUrlRow}>
                  <TextInput
                    style={[styles.input, styles.iceInput]}
                    value={server.urls}
                    autoCapitalize="none"
                    placeholder={t('settings.icePh')}
                    placeholderTextColor={colors.gray500}
                    onChangeText={(v) => patchIce(i, { urls: v })}
                  />
                  <Pressable
                    style={styles.iceDel}
                    onPress={() =>
                      patch({ iceServers: form.iceServers.filter((_, idx) => idx !== i) })
                    }
                  >
                    <Icon name="trash" size={16} color={colors.white} />
                  </Pressable>
                </View>
                {server.urls.startsWith('turn') && (
                  <View style={styles.iceCredRow}>
                    <TextInput
                      style={[styles.input, styles.iceCred]}
                      value={server.username ?? ''}
                      autoCapitalize="none"
                      placeholder={t('settings.turnUser')}
                      placeholderTextColor={colors.gray500}
                      onChangeText={(v) => patchIce(i, { username: v })}
                    />
                    <TextInput
                      style={[styles.input, styles.iceCred]}
                      value={server.credential ?? ''}
                      autoCapitalize="none"
                      placeholder={t('settings.turnCred')}
                      placeholderTextColor={colors.gray500}
                      onChangeText={(v) => patchIce(i, { credential: v })}
                    />
                  </View>
                )}
              </View>
            ))}
            <Pressable
              style={styles.addIce}
              onPress={() => patch({ iceServers: [...form.iceServers, { urls: '' }] })}
            >
              <Text style={styles.addIceText}>{t('settings.addIce')}</Text>
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>{t('settings.smart')}</Text>
            <Checkbox
              checked={form.smart.iceRestartOnNetworkChange}
              onChange={(v) => patchSmart({ iceRestartOnNetworkChange: v })}
              label={t('settings.smart.net')}
            />
            <Checkbox
              checked={form.smart.iceRestartOnIceFailure}
              onChange={(v) => patchSmart({ iceRestartOnIceFailure: v })}
              label={t('settings.smart.fail')}
            />
            <Checkbox
              checked={form.smart.reconnectOnWsDrop}
              onChange={(v) => patchSmart({ reconnectOnWsDrop: v })}
              label={t('settings.smart.ws')}
            />

            <Collapsible title={t('settings.advWebrtc')}>
              <Field label={t('settings.bundlePolicy')}>
                <Select
                  value={form.bundlePolicy}
                  onValueChange={(v) => patch({ bundlePolicy: v as RTCBundlePolicy })}
                  options={[
                    { value: 'max-bundle', label: t('settings.bundle.maxBundle') },
                    { value: 'balanced', label: t('settings.bundle.balanced') },
                    { value: 'max-compat', label: t('settings.bundle.maxCompat') }
                  ]}
                />
              </Field>
              <Field label={t('settings.rtcpMux')}>
                <Select
                  value={form.rtcpMuxPolicy}
                  onValueChange={(v) => patch({ rtcpMuxPolicy: v as RTCRtcpMuxPolicy })}
                  options={[
                    { value: 'require', label: t('settings.rtcp.require') },
                    { value: 'negotiate', label: t('settings.rtcp.negotiate') }
                  ]}
                />
              </Field>
              <Field label={t('settings.icePool')}>
                <NumberInput
                  value={form.iceCandidatePoolSize}
                  onChange={(n) => patch({ iceCandidatePoolSize: n })}
                />
              </Field>
              <Field label={t('settings.iceTimeout')}>
                <NumberInput
                  value={form.iceGatheringTimeoutMs}
                  onChange={(n) => patch({ iceGatheringTimeoutMs: n })}
                />
                <Text style={styles.hint}>{t('settings.iceTimeoutHint')}</Text>
              </Field>
              <Field label={t('settings.peerIdentity')}>
                <TextInput
                  style={styles.input}
                  value={form.peerIdentity}
                  autoCapitalize="none"
                  placeholder={t('settings.peerIdentityPh')}
                  placeholderTextColor={colors.gray500}
                  onChangeText={(v) => patch({ peerIdentity: v })}
                />
                <Text style={styles.hint}>{t('settings.peerIdentityHint')}</Text>
              </Field>
            </Collapsible>
          </Section>

          <View style={styles.saveRow}>
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.gray700 }]} onPress={save}>
              <Text style={styles.saveText}>{t('settings.save')}</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, { backgroundColor: colors.blue600 }]}
              onPress={saveAndConnect}
            >
              <Text style={styles.saveText}>{t('settings.saveConnect')}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

// ---- small building blocks -------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <TextInput
      style={styles.input}
      value={String(value)}
      keyboardType="numeric"
      onChangeText={(v) => {
        const n = parseInt(v, 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
    />
  );
}

function Section({
  icon,
  title,
  subtitle,
  children
}: {
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={colors.white} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Text style={styles.sectionSub}>{subtitle}</Text>
      {children}
    </View>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.collapsible}>
      <Pressable style={styles.collapsibleHead} onPress={() => setOpen((o) => !o)}>
        <Icon name={open ? 'chevron-down' : 'chevron-down'} size={12} color={colors.gray300} />
        <Text style={styles.collapsibleTitle}>{title}</Text>
      </Pressable>
      {open && <View style={styles.collapsibleBody}>{children}</View>}
    </View>
  );
}

function ProfileBtn({
  icon,
  label,
  onPress,
  disabled
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.profileBtn, disabled && styles.profileBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Icon name={icon} size={14} color={colors.white} />
      <Text style={styles.profileBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.black },
  content: { padding: 16, maxWidth: 448, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  back: { padding: 8, marginRight: 8, marginLeft: -8 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.white, flex: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.full },
  statusText: { fontSize: 11, color: colors.white },
  card: { gap: 12, padding: 16, backgroundColor: colors.gray800, borderRadius: radius.lg, marginBottom: 24 },
  profileBtns: { flexDirection: 'row', gap: 8 },
  profileBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: colors.gray700,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileBtnDisabled: { opacity: 0.4 },
  profileBtnText: { color: colors.white, fontSize: 13 },
  formWrap: { gap: 24 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '500', color: colors.gray200 },
  input: {
    width: '100%',
    backgroundColor: colors.gray700,
    color: colors.white,
    borderWidth: 1,
    borderColor: colors.gray600,
    borderRadius: radius.md,
    padding: 8
  },
  textarea: { minHeight: 56, textAlignVertical: 'top' },
  passwordRow: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 40 },
  eyeBtn: { position: 'absolute', right: 0, paddingHorizontal: 12, height: '100%', justifyContent: 'center' },
  section: { gap: 16, padding: 16, backgroundColor: colors.gray800, borderRadius: radius.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: colors.white },
  sectionSub: { fontSize: 11, color: colors.gray400, marginTop: -8 },
  collapsible: { gap: 8 },
  collapsibleHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  collapsibleTitle: { fontSize: 13, fontWeight: '500', color: colors.gray300 },
  collapsibleBody: { gap: 16, paddingTop: 4 },
  iceRow: { padding: 8, backgroundColor: 'rgba(55,65,81,0.5)', borderRadius: radius.md, gap: 8 },
  iceUrlRow: { flexDirection: 'row', gap: 8 },
  iceInput: { flex: 1 },
  iceDel: {
    paddingHorizontal: 12,
    backgroundColor: colors.gray600,
    borderRadius: radius.md,
    justifyContent: 'center'
  },
  iceCredRow: { flexDirection: 'row', gap: 8 },
  iceCred: { flex: 1 },
  addIce: {
    paddingVertical: 8,
    backgroundColor: colors.gray700,
    borderRadius: radius.md,
    alignItems: 'center'
  },
  addIceText: { color: colors.white, fontSize: 13 },
  hint: { fontSize: 11, color: colors.gray500 },
  saveRow: { flexDirection: 'row', gap: 8, paddingBottom: 32 },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '500' }
});

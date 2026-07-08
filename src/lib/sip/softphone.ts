import { get, writable } from '../store';
import { JsSIPAdapter } from './JsSIPAdapter';
import { NetworkMonitor } from './NetworkMonitor';
import type {
	CallInfo,
	Diagnostics,
	EngineEvent,
	LogEntry,
	RegistrationState,
	SipProfile,
	WsState
} from './types';
import { callState, incomingCall, isHeld, isMuted } from '../stores';
import { activeProfile } from '../profiles';
import {
	localStream,
	mediaPermissionStatus,
	releaseLocalStream,
	requestMediaPermissions,
	selectedMicrophoneId
} from '../mediaService';
import { addNotification } from '../notifications';
import { t } from '../i18n';
import { emptyRtpStats } from './stats';

const LOG_LIMIT = 150;

function emptyDiagnostics(): Diagnostics {
	return {
		wsState: 'disconnected',
		registration: 'unregistered',
		iceConnectionState: 'new',
		iceGatheringState: 'new',
		candidatePairType: 'unknown',
		localCandidateType: 'unknown',
		remoteCandidateType: 'unknown',
		rtp: emptyRtpStats(),
		lastIceRestartAt: null,
		iceRestartCount: 0,
		log: []
	};
}

// ---- Stores (source of truth for the UI) ----------------------------------

export const registrationState = writable<RegistrationState>('unregistered');
export const wsState = writable<WsState>('disconnected');
export const remoteStream = writable<MediaStream | null>(null);
export const activeCall = writable<CallInfo | null>(null);
export const diagnostics = writable<Diagnostics>(emptyDiagnostics());

// ---- Module state ----------------------------------------------------------

let adapter: JsSIPAdapter | null = null;
let monitor: NetworkMonitor | null = null;
let currentProfile: SipProfile | null = null;

function patchDiag(patch: Partial<Diagnostics>): void {
	diagnostics.update((d) => ({ ...d, ...patch }));
}

function pushLog(level: LogEntry['level'], message: string): void {
	diagnostics.update((d) => ({
		...d,
		log: [...d.log, { at: Date.now(), level, message }].slice(-LOG_LIMIT)
	}));
}

// ---- Engine event handling ------------------------------------------------

function handleEvent(e: EngineEvent): void {
	switch (e.type) {
		case 'wsState':
			wsState.set(e.state);
			patchDiag({ wsState: e.state });
			break;

		case 'registration':
			registrationState.set(e.state);
			patchDiag({ registration: e.state });
			if (e.state === 'registered') addNotification(t('notif.registered'), 'success');
			if (e.state === 'failed')
				addNotification(t('notif.registrationFailed', { cause: e.cause ?? '' }), 'error');
			break;

		case 'incomingCall':
			activeCall.set(e.info);
			incomingCall.set({ caller: e.info.remoteIdentity });
			callState.set('incoming');
			break;

		case 'callProgress':
			break;

		case 'callConfirmed':
			activeCall.update((c) => (c ? { ...c, startedAt: Date.now() } : c));
			incomingCall.set(null);
			callState.set('in-call');
			break;

		case 'callEnded':
		case 'callFailed':
			resetCallState();
			if (e.type === 'callFailed' && e.cause) {
				addNotification(t('notif.callFailed', { cause: e.cause }), 'error');
			}
			break;

		case 'remoteStream':
			remoteStream.set(e.stream);
			break;

		case 'iceConnectionState':
			patchDiag({ iceConnectionState: e.state });
			break;

		case 'iceGatheringState':
			patchDiag({ iceGatheringState: e.state });
			break;

		case 'candidatePair':
			patchDiag({
				candidatePairType: e.pair,
				localCandidateType: e.local,
				remoteCandidateType: e.remote
			});
			break;

		case 'rtpStats':
			patchDiag({ rtp: e.stats });
			break;

		case 'iceRestart':
			diagnostics.update((d) => ({
				...d,
				lastIceRestartAt: Date.now(),
				iceRestartCount: d.iceRestartCount + 1
			}));
			pushLog('info', t('notif.iceRestart', { reason: e.reason }));
			break;

		case 'log':
			pushLog(e.level, e.message);
			if (e.level === 'error') addNotification(e.message, 'error');
			break;
	}
}

function resetCallState(): void {
	callState.set('idle');
	incomingCall.set(null);
	activeCall.set(null);
	remoteStream.set(null);
	isMuted.set(false);
	isHeld.set(false);
	// No active call → release the microphone so it is not held while idle.
	releaseLocalStream();
	patchDiag({
		iceConnectionState: 'new',
		iceGatheringState: 'new',
		candidatePairType: 'unknown',
		localCandidateType: 'unknown',
		remoteCandidateType: 'unknown',
		rtp: emptyRtpStats()
	});
}

function handleNetworkChange(reason: string): void {
	pushLog('warning', t('notif.networkChange', { reason }));
	if (adapter?.hasActiveSession() && currentProfile?.smart.iceRestartOnNetworkChange) {
		adapter.iceRestart(reason);
	}
}

// ---- Connection lifecycle -------------------------------------------------

/** Builds the adapter for the active profile and starts it (registration + network monitor). */
export function connect(): void {
	const profile = get(activeProfile);
	if (!profile) {
		addNotification(t('notif.noProfile'), 'warning');
		return;
	}
	if (!profile.uri || profile.wsServers.filter(Boolean).length === 0) {
		addNotification(t('notif.fillUri'), 'warning');
		return;
	}

	disconnect();

	currentProfile = profile;
	diagnostics.set(emptyDiagnostics());
	pushLog('info', t('notif.connecting', { name: profile.name }));

	adapter = new JsSIPAdapter(profile, handleEvent);
	adapter.start();

	monitor = new NetworkMonitor(handleNetworkChange);
	monitor.start();
}

/** Stops registration and clears state. */
export function disconnect(): void {
	monitor?.stop();
	monitor = null;
	adapter?.stop();
	adapter = null;
	currentProfile = null;
	resetCallState();
	registrationState.set('unregistered');
	wsState.set('disconnected');
}

/** Connects automatically if the active profile is complete (call on startup). */
export function autoConnect(): void {
	const profile = get(activeProfile);
	if (profile && profile.uri && profile.wsServers.filter(Boolean).length > 0) {
		connect();
	}
}

// ---- Media -----------------------------------------------------------------

async function ensureLocalStream(): Promise<MediaStream | null> {
	let stream = get(localStream);
	if (get(mediaPermissionStatus) === 'granted' && stream) return stream;
	const ok = await requestMediaPermissions(get(selectedMicrophoneId));
	if (!ok) {
		addNotification(t('notif.micDenied'), 'error');
		return null;
	}
	stream = get(localStream);
	return stream;
}

// ---- UI actions ------------------------------------------------------------

export async function makeCall(target: string): Promise<void> {
	if (!adapter) {
		addNotification(t('notif.notConnected'), 'warning');
		return;
	}
	const stream = await ensureLocalStream();
	if (!stream) return;

	activeCall.set({ direction: 'outgoing', remoteIdentity: target, startedAt: null });
	callState.set('calling');
	adapter.call(target, stream);
}

export async function answer(): Promise<void> {
	if (!adapter) return;
	const stream = await ensureLocalStream();
	if (!stream) return;
	adapter.answer(stream);
}

export function reject(): void {
	adapter?.reject();
	resetCallState();
}

export function hangup(): void {
	adapter?.hangup();
}

export function toggleMute(): void {
	const next = !get(isMuted);
	isMuted.set(next);
	adapter?.setMuted(next);
}

export function toggleHold(): void {
	const next = !get(isHeld);
	isHeld.set(next);
	adapter?.setHold(next);
}

export function sendDtmf(tone: string): void {
	adapter?.sendDtmf(tone);
}

export function transfer(target: string): void {
	adapter?.transfer(target);
}

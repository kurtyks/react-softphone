import * as JsSIP from 'jssip';
import type { UA, RTCSessionEvent } from 'jssip/lib/UA';
import type { RTCSession, PeerConnectionEvent, EndEvent, IceCandidateEvent } from 'jssip/lib/RTCSession';
import { buildRtcConfiguration, buildUaConfiguration } from './config';
import { emptyRtpSample, parseStats, type RtpSample } from './stats';
import type { CallInfo, EngineEmit, SipProfile } from './types';
import { t } from '../i18n';

const ICE_FAILURE_DEBOUNCE_MS = 1500;
const STATS_INTERVAL_MS = 2000;

/**
 * Adapter wrapping JsSIP.UA — the only place in the codebase that knows the jssip API.
 * Translates jssip/WebRTC events into neutral `EngineEvent`s and exposes simple action methods.
 */
export class JsSIPAdapter {
	private profile: SipProfile;
	private emit: EngineEmit;
	private ua: UA | null = null;
	private session: RTCSession | null = null;
	private pc: RTCPeerConnection | null = null;
	private remoteStream: MediaStream | null = null;
	private statsTimer: ReturnType<typeof setInterval> | null = null;
	private iceFailureTimer: ReturnType<typeof setTimeout> | null = null;
	private iceGatherTimer: ReturnType<typeof setTimeout> | null = null;
	private renegotiating = false;
	private lastRtpSample: RtpSample = emptyRtpSample();

	constructor(profile: SipProfile, emit: EngineEmit) {
		this.profile = profile;
		this.emit = emit;
	}

	// ---- UA lifecycle --------------------------------------------------------

	start(): void {
		if (this.ua) return;
		const config = buildUaConfiguration(this.profile, (dir, data) =>
			this.handleSipMessage(dir, data)
		);
		if (!config.uri || (Array.isArray(config.sockets) && config.sockets.length === 0)) {
			this.log('error', t('log.noUriWs'));
			return;
		}

		const ua = new JsSIP.UA(config);
		this.ua = ua;

		ua.on('connecting', () => this.emit({ type: 'wsState', state: 'connecting' }));
		ua.on('connected', () => {
			this.emit({ type: 'wsState', state: 'connected' });
			this.log('success', t('log.wsConnected'));
		});
		ua.on('disconnected', (e) => {
			const info = e as { error?: boolean; code?: number; reason?: string } | undefined;
			const detail = info?.code
				? ` (code ${info.code}${info.reason ? `, ${info.reason}` : ''})`
				: info?.error
					? ` (${t('log.wsTransportError')})`
					: '';
			this.emit({ type: 'wsState', state: 'disconnected' });
			this.log('warning', t('log.wsDisconnected', { detail }));
			if (!this.profile.smart.reconnectOnWsDrop) {
				this.ua?.stop();
			}
		});
		ua.on('registered', () => {
			this.emit({ type: 'registration', state: 'registered' });
			this.log('success', t('log.registered'));
		});
		ua.on('unregistered', () => {
			this.emit({ type: 'registration', state: 'unregistered' });
			this.log('info', t('log.unregistered'));
		});
		ua.on('registrationFailed', (e) => {
			const evt = e as {
				cause?: string;
				response?: { status_code?: number; reason_phrase?: string };
			};
			const cause = evt.cause ?? t('log.unknownCause');
			const status = evt.response?.status_code
				? `${evt.response.status_code} ${evt.response.reason_phrase ?? ''} — `
				: '';
			this.emit({ type: 'registration', state: 'failed', cause });
			this.log('error', t('log.registrationFailed', { status, cause }));
		});
		ua.on('newRTCSession', (e: RTCSessionEvent) => this.handleNewSession(e));

		this.emit({ type: 'registration', state: this.profile.register ? 'registering' : 'unregistered' });
		ua.start();
	}

	stop(): void {
		this.clearStatsTimer();
		this.clearIceFailureTimer();
		this.clearIceGatherTimer();
		try {
			this.session?.terminate();
		} catch {
			/* session may already be terminated */
		}
		this.session = null;
		this.cleanupPc();
		this.ua?.stop();
		this.ua?.removeAllListeners();
		this.ua = null;
	}

	// ---- Actions -------------------------------------------------------------

	call(target: string, localStream: MediaStream): void {
		if (!this.ua) {
			this.emit({ type: 'callFailed', cause: t('cause.notConnected') });
			return;
		}
		// Registration is only required when the profile asks for it; otherwise an
		// unregistered (e.g. IP-authenticated / trunk) outgoing call is allowed.
		if (this.profile.register && !this.ua.isRegistered()) {
			this.log('error', t('log.notRegisteredCall'));
			this.emit({ type: 'callFailed', cause: t('cause.unregistered') });
			return;
		}
		try {
			this.ua.call(target, {
				mediaStream: localStream,
				pcConfig: buildRtcConfiguration(this.profile),
				rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
				eventHandlers: {}
			});
			// The session is handled in handleNewSession (originator=local).
		} catch (err) {
			this.log('error', t('log.callInitError', { err: String(err) }));
			this.emit({ type: 'callFailed', cause: String(err) });
		}
	}

	answer(localStream: MediaStream): void {
		if (!this.session || this.session.direction !== 'incoming') {
			this.log('warning', t('log.noIncoming'));
			return;
		}
		this.session.answer({
			mediaStream: localStream,
			pcConfig: buildRtcConfiguration(this.profile),
			rtcAnswerConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false }
		});
	}

	/** Reject an incoming call (603 Decline). */
	reject(): void {
		try {
			this.session?.terminate({ status_code: 603, reason_phrase: 'Decline' });
		} catch {
			/* noop */
		}
	}

	/** End the active call (BYE/CANCEL). */
	hangup(): void {
		try {
			this.session?.terminate();
		} catch {
			/* noop */
		}
	}

	setMuted(muted: boolean): void {
		if (!this.session) return;
		if (muted) this.session.mute({ audio: true });
		else this.session.unmute({ audio: true });
	}

	setHold(hold: boolean): void {
		if (!this.session) return;
		if (hold) this.session.hold();
		else this.session.unhold();
	}

	sendDtmf(tone: string): void {
		if (!this.session) return;
		const transportType = JsSIP.C.DTMF_TRANSPORT[this.profile.dtmfMode];
		this.session.sendDTMF(tone, { transportType });
	}

	transfer(target: string): void {
		this.session?.refer(target);
	}

	/** Forces an ICE restart on the ongoing session (e.g. after a network change). */
	iceRestart(reason: string): void {
		const session = this.session;
		if (!session || !session.isEstablished() || this.renegotiating) return;
		this.renegotiating = true;
		const ok = session.renegotiate({ rtcOfferConstraints: { iceRestart: true } }, () => {
			this.renegotiating = false;
		});
		if (ok) {
			this.emit({ type: 'iceRestart', reason });
			this.log('info', t('log.iceRestart', { reason }));
		} else {
			this.renegotiating = false;
		}
	}

	hasActiveSession(): boolean {
		return this.session !== null;
	}

	// ---- Session handling ----------------------------------------------------

	private handleNewSession(e: RTCSessionEvent): void {
		const session = e.session;
		const incoming = e.originator === 'remote';

		// One line at a time — reject any further incoming calls as busy.
		if (this.session && this.session !== session) {
			if (incoming) {
				session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
				this.log('info', t('log.rejectedSecond'));
			}
			return;
		}

		this.session = session;

		if (incoming) {
			const info: CallInfo = {
				direction: 'incoming',
				remoteIdentity: session.remote_identity?.uri?.user ?? 'nieznany',
				startedAt: null
			};
			this.emit({ type: 'incomingCall', info });
			this.log('info', t('log.incomingFrom', { id: info.remoteIdentity }));
		}

		session.on('peerconnection', (ev: PeerConnectionEvent) =>
			this.setupPeerConnection(ev.peerconnection)
		);
		// If the pc already exists (e.g. for outgoing calls), wire it up immediately.
		if (session.connection) this.setupPeerConnection(session.connection);

		session.on('progress', () => this.emit({ type: 'callProgress' }));
		session.on('confirmed', () => {
			this.emit({ type: 'callConfirmed' });
			this.startStatsTimer();
			this.log('success', t('log.established'));
		});
		session.on('ended', (ev: EndEvent) => this.endSession('callEnded', this.describeEnd(ev)));
		session.on('failed', (ev: EndEvent) => this.endSession('callFailed', this.describeEnd(ev)));
		session.on('getusermediafailed', () =>
			this.log('error', t('log.getUserMediaFailed'))
		);

		// jssip waits for ICE gathering to finish before sending the offer/answer.
		// To bound that latency, force-send with the candidates gathered so far once
		// the configured timeout elapses (0 = disabled, wait for full gathering).
		const timeout = this.profile.iceGatheringTimeoutMs;
		if (timeout > 0) {
			session.on('icecandidate', ({ ready }: IceCandidateEvent) => {
				if (this.iceGatherTimer) return; // timer already armed for this offer
				this.iceGatherTimer = setTimeout(() => {
					this.iceGatherTimer = null;
					ready();
					this.log('info', t('log.iceOfferSent', { timeout }));
				}, timeout);
			});
		}
	}

	private endSession(type: 'callEnded' | 'callFailed', cause?: string): void {
		this.clearStatsTimer();
		this.clearIceFailureTimer();
		this.clearIceGatherTimer();
		this.cleanupPc();
		this.session = null;
		this.renegotiating = false;
		this.emit(type === 'callEnded' ? { type: 'callEnded', cause } : { type: 'callFailed', cause });
		this.log(
			type === 'callFailed' ? 'error' : 'info',
			t('log.callEnded', { cause: cause ? `: ${cause}` : '' })
		);
	}

	/** Builds a verbose end/failed description: cause + SIP response code + who ended it. */
	private describeEnd(ev: EndEvent): string {
		const cause = ev?.cause ?? '';
		const msg = (ev as { message?: { status_code?: number; reason_phrase?: string } })?.message;
		const originator = (ev as { originator?: string })?.originator;
		const status = msg?.status_code ? `${msg.status_code} ${msg.reason_phrase ?? ''}`.trim() : '';
		const who = originator ? t('log.endParty', { originator }) : '';
		return [cause, status, who].filter(Boolean).join(' · ');
	}

	// ---- PeerConnection / ICE / stats ---------------------------------------

	private setupPeerConnection(pc: RTCPeerConnection): void {
		if (this.pc === pc) return;
		this.pc = pc;
		this.remoteStream = new MediaStream();

		pc.addEventListener('track', (ev: RTCTrackEvent) => {
			const stream = ev.streams[0];
			if (stream) {
				this.remoteStream = stream;
			} else if (this.remoteStream) {
				this.remoteStream.addTrack(ev.track);
			}
			this.emit({ type: 'remoteStream', stream: this.remoteStream! });
		});

		pc.addEventListener('iceconnectionstatechange', () => {
			const state = pc.iceConnectionState;
			this.emit({ type: 'iceConnectionState', state });
			this.handleIceState(state);
		});

		pc.addEventListener('icegatheringstatechange', () => {
			this.emit({ type: 'iceGatheringState', state: pc.iceGatheringState });
		});

		// STUN/TURN reachability problems surface here — invaluable when a call has no media.
		pc.addEventListener('icecandidateerror', (ev: RTCPeerConnectionIceErrorEvent) => {
			const target = ev.url || (ev.address ? `${ev.address}:${ev.port ?? ''}` : '');
			const detail =
				`${ev.errorCode} ${ev.errorText ?? ''}${target ? ` (${target})` : ''}`.trim();
			this.log('error', t('log.iceCandidateError', { detail }));
		});
	}

	private handleIceState(state: RTCIceConnectionState): void {
		if (state === 'connected' || state === 'completed') {
			this.clearIceFailureTimer();
			return;
		}
		if (state === 'failed' || state === 'disconnected') {
			// Always surface the trouble in the log, even if auto-restart is off.
			this.log(state === 'failed' ? 'error' : 'warning', t('log.iceState', { state }));
			if (this.profile.smart.iceRestartOnIceFailure) {
				// 'disconnected' is often transient — wait before restarting ICE.
				this.clearIceFailureTimer();
				this.iceFailureTimer = setTimeout(() => {
					const current = this.pc?.iceConnectionState;
					if (current === 'failed' || current === 'disconnected') {
						this.iceRestart(t('log.iceReasonState', { state: current }));
					}
				}, ICE_FAILURE_DEBOUNCE_MS);
			}
		}
	}

	private startStatsTimer(): void {
		this.clearStatsTimer();
		this.lastRtpSample = emptyRtpSample();
		this.statsTimer = setInterval(() => this.pollStats(), STATS_INTERVAL_MS);
		void this.pollStats();
	}

	private async pollStats(): Promise<void> {
		const pc = this.pc;
		if (!pc) return;
		try {
			const report = await pc.getStats();
			const reports = Array.from(report.values());
			const parsed = parseStats(reports, this.lastRtpSample);
			this.lastRtpSample = parsed.sample;

			this.emit({
				type: 'candidatePair',
				pair: parsed.candidatePairType,
				local: parsed.localCandidateType,
				remote: parsed.remoteCandidateType
			});
			this.emit({ type: 'rtpStats', stats: parsed.rtp });
		} catch {
			/* getStats may briefly throw during renegotiation */
		}
	}

	// ---- Cleanup -------------------------------------------------------------

	private cleanupPc(): void {
		this.pc = null;
		this.remoteStream?.getTracks().forEach((t) => t.stop());
		this.remoteStream = null;
	}

	private clearStatsTimer(): void {
		if (this.statsTimer) {
			clearInterval(this.statsTimer);
			this.statsTimer = null;
		}
	}

	private clearIceFailureTimer(): void {
		if (this.iceFailureTimer) {
			clearTimeout(this.iceFailureTimer);
			this.iceFailureTimer = null;
		}
	}

	private clearIceGatherTimer(): void {
		if (this.iceGatherTimer) {
			clearTimeout(this.iceGatherTimer);
			this.iceGatherTimer = null;
		}
	}

	private log(level: 'info' | 'success' | 'warning' | 'error', message: string): void {
		this.emit({ type: 'log', level, message });
	}

	/**
	 * Mirrors a raw SIP frame: a concise first-line summary into the diagnostics log,
	 * and the full message (plus peer chatter) into the browser console, colourised green.
	 */
	private handleSipMessage(direction: 'sent' | 'recv', data: string): void {
		if (!data || !data.trim()) return; // skip WebSocket keep-alive (CRLF) pings
		const firstLine = data.split('\r\n', 1)[0]?.trim() ?? '';
		if (!firstLine) return;
		const arrow = direction === 'sent' ? '→' : '←';
		this.log('info', `SIP ${arrow} ${summarizeSipLine(firstLine)}`);
		if (typeof console !== 'undefined') {
			const label = direction === 'sent' ? 'SIP TX ▶' : 'SIP RX ◀';
			console.log(
				`%c${label} ${firstLine}\n%c${data}`,
				'color:#16a34a;font-weight:bold',
				'color:#16a34a'
			);
		}
	}
}

/** Condenses a SIP request/status line for the log: "INVITE sip:bob@dom" or "200 OK". */
function summarizeSipLine(line: string): string {
	if (line.startsWith('SIP/2.0')) return line.replace(/^SIP\/2\.0\s+/, '');
	return line.replace(/\s+SIP\/2\.0\s*$/, '');
}

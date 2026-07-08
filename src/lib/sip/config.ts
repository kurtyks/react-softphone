import * as JsSIP from 'jssip';
import type { UAConfiguration } from 'jssip/lib/UA';
import type { IceServerConfig, SipProfile } from './types';

/** Generates a short, unique profile id. */
export function makeId(): string {
	return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Default profile with interoperable settings for Asterisk / Kamailio / FreeSWITCH:
 * - session timers off (safer for a default Kamailio),
 * - DTMF RFC2833 (in-band telephone-event),
 * - bundle/rtcp-mux required (supported by all three backends).
 */
export function defaultProfile(overrides: Partial<SipProfile> = {}): SipProfile {
	return {
		id: makeId(),
		name: 'New profile',

		uri: '',
		password: '',
		authorizationUser: '',
		displayName: '',

		wsServers: [],
		registrarServer: '',
		register: true,
		registerExpires: 600,
		userAgent: 'Softphone-Dev',

		sessionTimers: false,
		noAnswerTimeout: 60,
		dtmfMode: 'RFC2833',

		iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
		iceTransportPolicy: 'all',
		bundlePolicy: 'max-bundle',
		rtcpMuxPolicy: 'require',
		iceCandidatePoolSize: 0,
		peerIdentity: '',
		iceGatheringTimeoutMs: 3000,

		smart: {
			iceRestartOnNetworkChange: true,
			iceRestartOnIceFailure: true,
			reconnectOnWsDrop: true
		},
		...overrides
	};
}

/** Fills missing profile fields with defaults (e.g. after loading an older format). */
export function normalizeProfile(p: Partial<SipProfile>): SipProfile {
	const base = defaultProfile();
	return {
		...base,
		...p,
		id: p.id ?? base.id,
		wsServers: Array.isArray(p.wsServers) ? p.wsServers : base.wsServers,
		iceServers: Array.isArray(p.iceServers) ? p.iceServers : base.iceServers,
		smart: { ...base.smart, ...(p.smart ?? {}) }
	};
}

/**
 * Migrates the old flat `sipConfig` from localStorage into a new profile.
 * Returns a profile, or null if there is nothing to migrate.
 */
export function migrateLegacyConfig(): SipProfile | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem('sipConfig');
	if (!raw) return null;

	try {
		const old = JSON.parse(raw);
		const split = (s: unknown): string[] =>
			typeof s === 'string'
				? s.split(',').map((x) => x.trim()).filter(Boolean)
				: [];

		const iceServers: IceServerConfig[] = [
			...split(old.stun_servers).map((urls) => ({ urls })),
			// The old TURN format did not store credentials — keep just the urls.
			...split(old.turn_servers).map((urls) => ({ urls }))
		];

		const profile = normalizeProfile({
			name: 'Imported profile',
			uri: old.uri ?? '',
			password: old.password ?? '',
			authorizationUser: old.authorization_user ?? '',
			displayName: old.display_name ?? '',
			wsServers: split(old.sockets),
			registrarServer: old.registrar_server ?? '',
			register: old.register ?? true,
			registerExpires: old.register_expires ?? 600,
			userAgent: old.user_agent ?? 'Softphone-Dev',
			sessionTimers: old.session_timers ?? false,
			noAnswerTimeout: old.no_answer_timeout ?? 60,
			iceServers: iceServers.length ? iceServers : undefined
		});

		// The old key is no longer needed.
		localStorage.removeItem('sipConfig');
		return profile;
	} catch {
		return null;
	}
}

/**
 * Builds the RTCConfiguration (pcConfig) passed to every session.
 * STUN/TURN and the ICE policy live here — NOT in the UA configuration.
 */
export function buildRtcConfiguration(profile: SipProfile): RTCConfiguration {
	const iceServers: RTCIceServer[] = profile.iceServers
		.filter((s) => s.urls && s.urls.trim().length > 0)
		.map((s) => {
			const server: RTCIceServer = { urls: s.urls.trim() };
			if (s.username) server.username = s.username;
			if (s.credential) server.credential = s.credential;
			return server;
		});

	const config: RTCConfiguration = {
		iceServers,
		iceTransportPolicy: profile.iceTransportPolicy,
		bundlePolicy: profile.bundlePolicy,
		rtcpMuxPolicy: profile.rtcpMuxPolicy,
		iceCandidatePoolSize: profile.iceCandidatePoolSize
	};

	// peerIdentity is not in the current lib RTCConfiguration type; attach it only when set.
	if (profile.peerIdentity) {
		(config as RTCConfiguration & { peerIdentity?: string }).peerIdentity = profile.peerIdentity;
	}

	return config;
}

/** Callback invoked for every raw SIP frame crossing a WebSocket, in both directions. */
export type SipMessageTap = (direction: 'sent' | 'recv', message: string) => void;

/**
 * Wraps a JsSIP WebSocket socket so every SIP frame is mirrored to `onMessage` before
 * jssip processes it. Outgoing frames go through the socket's `send`; incoming frames
 * arrive via the `ondata` handler that jssip's Transport assigns — we expose that as an
 * accessor whose getter returns a logging wrapper around the real handler.
 */
function tapSipSocket(socket: JsSIP.WebSocketInterface, onMessage: SipMessageTap): void {
	const sock = socket as unknown as {
		send: (data: string) => boolean;
		ondata: ((data: string) => void) | null;
	};

	const origSend = sock.send.bind(sock);
	sock.send = (data: string) => {
		try {
			onMessage('sent', String(data));
		} catch {
			/* never let logging break signalling */
		}
		return origSend(data);
	};

	let realOndata: ((data: string) => void) | null = null;
	Object.defineProperty(sock, 'ondata', {
		configurable: true,
		enumerable: true,
		get() {
			if (!realOndata) return realOndata;
			const handler = realOndata;
			return (data: string) => {
				try {
					onMessage('recv', String(data));
				} catch {
					/* never let logging break signalling */
				}
				return handler(data);
			};
		},
		set(fn: ((data: string) => void) | null) {
			realOndata = fn;
		}
	});
}

/**
 * Builds the JsSIP.UA configuration. STUN/TURN are omitted — they go to pcConfig per session.
 * When `onSipMessage` is given, every socket is tapped to mirror raw SIP frames to it.
 */
export function buildUaConfiguration(
	profile: SipProfile,
	onSipMessage?: SipMessageTap
): UAConfiguration {
	const sockets = profile.wsServers
		.map((u) => u.trim())
		.filter(Boolean)
		.map((u) => {
			const socket = new JsSIP.WebSocketInterface(u);
			if (onSipMessage) tapSipSocket(socket, onSipMessage);
			return socket;
		});

	const config: UAConfiguration = {
		uri: profile.uri.trim(),
		sockets,
		password: profile.password || undefined,
		authorization_user: profile.authorizationUser || undefined,
		display_name: profile.displayName || undefined,
		register: profile.register,
		register_expires: profile.registerExpires,
		registrar_server: profile.registrarServer || undefined,
		session_timers: profile.sessionTimers,
		no_answer_timeout: profile.noAnswerTimeout,
		user_agent: profile.userAgent || undefined
	};

	return config;
}

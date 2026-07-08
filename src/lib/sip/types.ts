/**
 * SIP/WebRTC domain types for the webphone.
 * Profiles are independent of jssip — the adapter maps them onto UA/pcConfig.
 */

/** A single ICE server (STUN without credentials, TURN with credentials). */
export interface IceServerConfig {
	urls: string; // e.g. "stun:stun.l.google.com:19302" or "turn:turn.example.com:3478?transport=udp"
	username?: string;
	credential?: string;
}

export type IceTransportPolicy = 'all' | 'relay';
export type DtmfMode = 'RFC2833' | 'INFO';

/** Smart auto-recovery behaviours. */
export interface SmartSettings {
	/** ICE restart when the network changes (e.g. WiFi -> LTE) during a call. */
	iceRestartOnNetworkChange: boolean;
	/** ICE restart when iceConnectionState enters 'failed'/'disconnected'. */
	iceRestartOnIceFailure: boolean;
	/** Automatically resume the WS connection after it drops. */
	reconnectOnWsDrop: boolean;
}

/** A complete SIP account profile — one config set for connecting to one backend. */
export interface SipProfile {
	id: string;
	name: string;

	// Identity / credentials
	uri: string; // sip:user@domain
	password: string;
	authorizationUser: string;
	displayName: string;

	// Transport
	wsServers: string[]; // wss://... (multiple -> failover)
	registrarServer: string;
	register: boolean;
	registerExpires: number;
	userAgent: string;

	// Signalling
	sessionTimers: boolean;
	noAnswerTimeout: number;
	dtmfMode: DtmfMode;

	// WebRTC / ICE
	iceServers: IceServerConfig[];
	iceTransportPolicy: IceTransportPolicy;
	bundlePolicy: RTCBundlePolicy;
	rtcpMuxPolicy: RTCRtcpMuxPolicy;
	iceCandidatePoolSize: number;
	peerIdentity: string; // optional target peer identity assertion (empty = unused)
	iceGatheringTimeoutMs: number; // cap ICE gathering before sending the offer; 0 = wait for full gathering

	smart: SmartSettings;
}

export type RegistrationState = 'unregistered' | 'registering' | 'registered' | 'failed';
export type WsState = 'disconnected' | 'connecting' | 'connected';
export type CallState = 'idle' | 'calling' | 'incoming' | 'in-call';

/** Selected ICE candidate pair type — shows which path the media takes. */
export type CandidatePairType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

/** Live RTP quality metrics for the active audio stream. */
export interface RtpStats {
	jitterMs: number; // inbound jitter
	packetsLost: number; // cumulative inbound packets lost
	packetLossPct: number; // 0–100
	rttMs: number; // round-trip time
	inboundKbps: number; // receive bitrate
	outboundKbps: number; // send bitrate
	codec: string; // e.g. "opus/48000" or "—"
}

/** Information about the active call (for the UI). */
export interface CallInfo {
	direction: 'incoming' | 'outgoing';
	remoteIdentity: string; // user / number
	startedAt: number | null; // timestamp when established (confirmed)
}

/** Live diagnostic snapshot rendered in the /diagnostics panel. */
export interface Diagnostics {
	wsState: WsState;
	registration: RegistrationState;
	iceConnectionState: RTCIceConnectionState;
	iceGatheringState: RTCIceGatheringState;
	candidatePairType: CandidatePairType;
	localCandidateType: CandidatePairType;
	remoteCandidateType: CandidatePairType;
	rtp: RtpStats;
	lastIceRestartAt: number | null;
	iceRestartCount: number;
	log: LogEntry[];
}

export interface LogEntry {
	at: number;
	level: 'info' | 'success' | 'warning' | 'error';
	message: string;
}

/**
 * Events emitted by the adapter to the orchestrator.
 * Discriminated by the `type` field.
 */
export type EngineEvent =
	| { type: 'wsState'; state: WsState }
	| { type: 'registration'; state: RegistrationState; cause?: string }
	| { type: 'incomingCall'; info: CallInfo }
	| { type: 'callProgress' }
	| { type: 'callConfirmed' }
	| { type: 'callEnded'; cause?: string }
	| { type: 'callFailed'; cause?: string }
	| { type: 'remoteStream'; stream: MediaStream }
	| { type: 'iceConnectionState'; state: RTCIceConnectionState }
	| { type: 'iceGatheringState'; state: RTCIceGatheringState }
	| { type: 'candidatePair'; pair: CandidatePairType; local: CandidatePairType; remote: CandidatePairType }
	| { type: 'rtpStats'; stats: RtpStats }
	| { type: 'iceRestart'; reason: string }
	| { type: 'log'; level: LogEntry['level']; message: string };

export type EngineEmit = (event: EngineEvent) => void;

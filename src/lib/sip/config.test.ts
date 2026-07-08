import { describe, it, expect, beforeEach } from 'vitest';
import {
	defaultProfile,
	normalizeProfile,
	migrateLegacyConfig,
	buildRtcConfiguration,
	buildUaConfiguration
} from './config';

describe('defaultProfile', () => {
	it('has interoperable defaults', () => {
		const p = defaultProfile();
		expect(p.register).toBe(true);
		expect(p.registerExpires).toBe(600);
		expect(p.sessionTimers).toBe(false);
		expect(p.dtmfMode).toBe('RFC2833');
		expect(p.iceTransportPolicy).toBe('all');
		expect(p.bundlePolicy).toBe('max-bundle');
		expect(p.rtcpMuxPolicy).toBe('require');
		expect(p.peerIdentity).toBe('');
		expect(p.iceGatheringTimeoutMs).toBe(3000);
		expect(p.iceServers).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
		expect(p.smart.iceRestartOnNetworkChange).toBe(true);
	});

	it('applies overrides and generates unique ids', () => {
		const a = defaultProfile({ name: 'X', uri: 'sip:a@b' });
		const b = defaultProfile();
		expect(a.name).toBe('X');
		expect(a.uri).toBe('sip:a@b');
		expect(a.id).not.toBe(b.id);
	});
});

describe('normalizeProfile', () => {
	it('fills missing fields and keeps the provided id', () => {
		const p = normalizeProfile({ id: 'keep', uri: 'sip:x@y' });
		expect(p.id).toBe('keep');
		expect(p.uri).toBe('sip:x@y');
		expect(Array.isArray(p.wsServers)).toBe(true);
		expect(Array.isArray(p.iceServers)).toBe(true);
		expect(p.smart.reconnectOnWsDrop).toBe(true);
	});

	it('merges partial smart settings over defaults', () => {
		const p = normalizeProfile({ smart: { iceRestartOnNetworkChange: false } as never });
		expect(p.smart.iceRestartOnNetworkChange).toBe(false);
		expect(p.smart.iceRestartOnIceFailure).toBe(true); // default kept
	});
});

describe('buildRtcConfiguration', () => {
	it('maps STUN and TURN servers, dropping empty urls', () => {
		const profile = defaultProfile({
			iceServers: [
				{ urls: 'stun:stun.example.com' },
				{ urls: 'turn:turn.example.com:3478', username: 'u', credential: 'c' },
				{ urls: '   ' }
			]
		});
		const cfg = buildRtcConfiguration(profile);
		expect(cfg.iceServers).toEqual([
			{ urls: 'stun:stun.example.com' },
			{ urls: 'turn:turn.example.com:3478', username: 'u', credential: 'c' }
		]);
	});

	it('passes the policies through', () => {
		const profile = defaultProfile({
			iceTransportPolicy: 'relay',
			bundlePolicy: 'balanced',
			rtcpMuxPolicy: 'require',
			iceCandidatePoolSize: 4
		});
		const cfg = buildRtcConfiguration(profile);
		expect(cfg.iceTransportPolicy).toBe('relay');
		expect(cfg.bundlePolicy).toBe('balanced');
		expect(cfg.iceCandidatePoolSize).toBe(4);
	});

	it('attaches peerIdentity only when set', () => {
		const withId = buildRtcConfiguration(defaultProfile({ peerIdentity: 'me@idp' })) as RTCConfiguration & {
			peerIdentity?: string;
		};
		const without = buildRtcConfiguration(defaultProfile({ peerIdentity: '' })) as RTCConfiguration & {
			peerIdentity?: string;
		};
		expect(withId.peerIdentity).toBe('me@idp');
		expect(without.peerIdentity).toBeUndefined();
	});
});

describe('buildUaConfiguration', () => {
	it('builds one socket per non-empty WS server and maps fields', () => {
		const profile = defaultProfile({
			uri: 'sip:1001@example.com',
			password: 'secret',
			authorizationUser: 'authuser',
			wsServers: ['wss://a.example.com/ws', '   ', 'wss://b.example.com/ws'],
			registrarServer: 'sip:example.com',
			registerExpires: 120
		});
		const cfg = buildUaConfiguration(profile);
		expect(cfg.uri).toBe('sip:1001@example.com');
		expect(cfg.password).toBe('secret');
		expect(cfg.authorization_user).toBe('authuser');
		expect(cfg.register_expires).toBe(120);
		expect(cfg.registrar_server).toBe('sip:example.com');
		expect(Array.isArray(cfg.sockets) ? cfg.sockets.length : 0).toBe(2);
	});

	it('does not put STUN/TURN into the UA config', () => {
		const cfg = buildUaConfiguration(defaultProfile()) as unknown as Record<string, unknown>;
		expect(cfg.stun_servers).toBeUndefined();
		expect(cfg.turn_servers).toBeUndefined();
	});
});

describe('migrateLegacyConfig', () => {
	beforeEach(() => localStorage.clear());

	it('returns null when there is nothing to migrate', () => {
		expect(migrateLegacyConfig()).toBeNull();
	});

	it('maps the old flat config and removes the old key', () => {
		localStorage.setItem(
			'sipConfig',
			JSON.stringify({
				uri: 'sip:7@dom',
				password: 'pw',
				sockets: 'wss://a/ws, wss://b/ws',
				authorization_user: 'au',
				stun_servers: 'stun:s1',
				turn_servers: 'turn:t1',
				register_expires: 300,
				session_timers: true
			})
		);
		const p = migrateLegacyConfig();
		expect(p).not.toBeNull();
		expect(p!.uri).toBe('sip:7@dom');
		expect(p!.wsServers).toEqual(['wss://a/ws', 'wss://b/ws']);
		expect(p!.iceServers).toEqual([{ urls: 'stun:s1' }, { urls: 'turn:t1' }]);
		expect(p!.registerExpires).toBe(300);
		expect(p!.sessionTimers).toBe(true);
		expect(localStorage.getItem('sipConfig')).toBeNull();
	});
});

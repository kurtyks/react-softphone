import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from '../store';

// Capture adapter instances so tests can drive the engine event callback directly.
const { adapterInstances } = vi.hoisted(() => ({ adapterInstances: [] as any[] }));

vi.mock('./JsSIPAdapter', () => ({
	JsSIPAdapter: vi.fn().mockImplementation((profile: unknown, emit: unknown) => {
		const inst = {
			profile,
			emit,
			start: vi.fn(),
			stop: vi.fn(),
			hasActiveSession: vi.fn(() => false),
			iceRestart: vi.fn(),
			call: vi.fn(),
			answer: vi.fn(),
			reject: vi.fn(),
			hangup: vi.fn(),
			setMuted: vi.fn(),
			setHold: vi.fn(),
			sendDtmf: vi.fn(),
			transfer: vi.fn()
		};
		adapterInstances.push(inst);
		return inst;
	})
}));

vi.mock('./NetworkMonitor', () => ({
	NetworkMonitor: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }))
}));

import * as sp from './softphone';
import { defaultProfile } from './config';
import type { EngineEvent } from './types';
import { profiles, activeProfileId } from '../profiles';
import { callState, incomingCall } from '../stores';

function seedProfile() {
	const p = defaultProfile({ name: 'Test', uri: 'sip:1@dom', wsServers: ['wss://x/ws'] });
	profiles.set([p]);
	activeProfileId.set(p.id);
	return p;
}

function lastEmit(): (e: EngineEvent) => void {
	return adapterInstances[adapterInstances.length - 1].emit;
}

beforeEach(() => {
	sp.disconnect();
	adapterInstances.length = 0;
	localStorage.clear();
});

describe('connect / disconnect', () => {
	it('builds and starts an adapter for a complete profile', () => {
		seedProfile();
		sp.connect();
		expect(adapterInstances).toHaveLength(1);
		expect(adapterInstances[0].start).toHaveBeenCalled();
	});

	it('refuses to connect without uri or WS server', () => {
		const p = defaultProfile({ name: 'Bad', uri: '', wsServers: [] });
		profiles.set([p]);
		activeProfileId.set(p.id);
		sp.connect();
		expect(adapterInstances).toHaveLength(0);
	});

	it('stops the adapter on disconnect', () => {
		seedProfile();
		sp.connect();
		const inst = adapterInstances[0];
		sp.disconnect();
		expect(inst.stop).toHaveBeenCalled();
		expect(get(sp.registrationState)).toBe('unregistered');
		expect(get(sp.wsState)).toBe('disconnected');
	});
});

describe('engine event -> store mapping', () => {
	beforeEach(() => {
		seedProfile();
		sp.connect();
	});

	it('updates ws and registration state', () => {
		const emit = lastEmit();
		emit({ type: 'wsState', state: 'connected' });
		emit({ type: 'registration', state: 'registered' });
		expect(get(sp.wsState)).toBe('connected');
		expect(get(sp.registrationState)).toBe('registered');
		expect(get(sp.diagnostics).wsState).toBe('connected');
	});

	it('handles an incoming call then confirmation', () => {
		const emit = lastEmit();
		emit({ type: 'incomingCall', info: { direction: 'incoming', remoteIdentity: '42', startedAt: null } });
		expect(get(callState)).toBe('incoming');
		expect(get(incomingCall)?.caller).toBe('42');
		expect(get(sp.activeCall)?.remoteIdentity).toBe('42');

		emit({ type: 'callConfirmed' });
		expect(get(callState)).toBe('in-call');
		expect(get(incomingCall)).toBeNull();
		expect(get(sp.activeCall)?.startedAt).toBeTypeOf('number');
	});

	it('records ICE restarts and candidate path', () => {
		const emit = lastEmit();
		emit({ type: 'candidatePair', pair: 'relay', local: 'relay', remote: 'host' });
		emit({ type: 'iceRestart', reason: 'network change' });
		const d = get(sp.diagnostics);
		expect(d.candidatePairType).toBe('relay');
		expect(d.iceRestartCount).toBe(1);
		expect(d.lastIceRestartAt).toBeTypeOf('number');
	});

	it('stores RTP stats', () => {
		const emit = lastEmit();
		const stats = {
			jitterMs: 5,
			packetsLost: 2,
			packetLossPct: 1.5,
			rttMs: 40,
			inboundKbps: 80,
			outboundKbps: 78,
			codec: 'opus/48000'
		};
		emit({ type: 'rtpStats', stats });
		expect(get(sp.diagnostics).rtp).toEqual(stats);
	});

	it('resets call state when the call ends', () => {
		const emit = lastEmit();
		emit({ type: 'incomingCall', info: { direction: 'incoming', remoteIdentity: '42', startedAt: null } });
		emit({ type: 'callConfirmed' });
		emit({ type: 'callEnded' });
		expect(get(callState)).toBe('idle');
		expect(get(sp.activeCall)).toBeNull();
		expect(get(sp.remoteStream)).toBeNull();
	});

	it('appends engine log entries to diagnostics', () => {
		const emit = lastEmit();
		emit({ type: 'log', level: 'info', message: 'hello' });
		const log = get(sp.diagnostics).log;
		expect(log.at(-1)?.message).toBe('hello');
	});
});

import { describe, it, expect, beforeEach } from 'vitest';
import { get } from './store';
import {
	profiles,
	activeProfileId,
	activeProfile,
	initProfiles,
	addProfile,
	duplicateProfile,
	deleteProfile,
	updateProfile,
	setActiveProfile
} from './profiles';

beforeEach(() => {
	localStorage.clear();
	profiles.set([]);
	activeProfileId.set(null);
});

describe('initProfiles', () => {
	it('seeds a default profile and selects it when empty', () => {
		initProfiles();
		const list = get(profiles);
		expect(list).toHaveLength(1);
		expect(get(activeProfileId)).toBe(list[0].id);
		expect(get(activeProfile)?.id).toBe(list[0].id);
	});

	it('does not add a profile when some already exist', () => {
		profiles.set([{ ...addedProfile('A') }]);
		initProfiles();
		expect(get(profiles)).toHaveLength(1);
	});

	it('fixes a dangling active id', () => {
		profiles.set([addedProfile('A')]);
		activeProfileId.set('does-not-exist');
		initProfiles();
		expect(get(activeProfileId)).toBe(get(profiles)[0].id);
	});
});

describe('CRUD actions', () => {
	it('addProfile appends and activates', () => {
		const id = addProfile();
		expect(get(profiles)).toHaveLength(1);
		expect(get(activeProfileId)).toBe(id);
	});

	it('duplicateProfile clones with a new id and a suffixed name', () => {
		const id = addProfile();
		updateProfile(id, { name: 'Orig', uri: 'sip:x@y' });
		const copyId = duplicateProfile(id);
		const copy = get(profiles).find((p) => p.id === copyId)!;
		expect(get(profiles)).toHaveLength(2);
		expect(copyId).not.toBe(id);
		expect(copy.name).toBe('Orig (copy)');
		expect(copy.uri).toBe('sip:x@y');
		expect(get(activeProfileId)).toBe(copyId);
	});

	it('duplicateProfile returns null for an unknown id', () => {
		expect(duplicateProfile('nope')).toBeNull();
	});

	it('updateProfile merges fields', () => {
		const id = addProfile();
		updateProfile(id, { name: 'New', registerExpires: 42 });
		const p = get(profiles)[0];
		expect(p.name).toBe('New');
		expect(p.registerExpires).toBe(42);
	});

	it('deleteProfile removes and reassigns the active profile', () => {
		const a = addProfile();
		const b = addProfile();
		setActiveProfile(b);
		deleteProfile(b);
		expect(get(profiles).some((p) => p.id === b)).toBe(false);
		expect(get(activeProfileId)).toBe(a);
	});

	it('setActiveProfile switches the active profile', () => {
		const a = addProfile();
		const b = addProfile();
		setActiveProfile(a);
		expect(get(activeProfileId)).toBe(a);
		setActiveProfile(b);
		expect(get(activeProfileId)).toBe(b);
	});
});

// Minimal valid profile helper for seeding the store directly.
function addedProfile(name: string) {
	return {
		id: `id_${name}`,
		name,
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
		dtmfMode: 'RFC2833' as const,
		iceServers: [],
		iceTransportPolicy: 'all' as const,
		bundlePolicy: 'max-bundle' as RTCBundlePolicy,
		rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy,
		iceCandidatePoolSize: 0,
		peerIdentity: '',
		iceGatheringTimeoutMs: 3000,
		smart: {
			iceRestartOnNetworkChange: true,
			iceRestartOnIceFailure: true,
			reconnectOnWsDrop: true
		}
	};
}

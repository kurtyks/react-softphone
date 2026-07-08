import { derived, get } from './store';
import { persistentStore } from './utils/persistentStore';
import { defaultProfile, migrateLegacyConfig, normalizeProfile } from './sip/config';
import type { SipProfile } from './sip/types';

/** List of all SIP account profiles. */
export const profiles = persistentStore<SipProfile[]>('sip.profiles', []);

/** Id of the currently selected profile. */
export const activeProfileId = persistentStore<string | null>('sip.activeProfileId', null);

/** Convenient access to the active profile (or null). */
export const activeProfile = derived(
	[profiles, activeProfileId],
	([$profiles, $id]) => $profiles.find((p) => p.id === $id) ?? $profiles[0] ?? null
);

/**
 * One-time startup initialization (browser only):
 * - migrates the old flat config if present,
 * - creates an empty default profile when there are none,
 * - selects an active profile if none is chosen.
 */
export function initProfiles(): void {
	if (typeof window === 'undefined') return;

	let list = get(profiles).map(normalizeProfile);

	if (list.length === 0) {
		const migrated = migrateLegacyConfig();
		list = [migrated ?? defaultProfile({ name: 'Default profile' })];
		profiles.set(list);
	}

	const id = get(activeProfileId);
	if (!id || !list.some((p) => p.id === id)) {
		activeProfileId.set(list[0].id);
	}
}

/** Adds a new empty profile and makes it active. Returns its id. */
export function addProfile(): string {
	const p = defaultProfile();
	profiles.update((list) => [...list, p]);
	activeProfileId.set(p.id);
	return p.id;
}

/** Duplicates the given profile (copy with a new id and name). Returns the copy's id. */
export function duplicateProfile(id: string): string | null {
	const src = get(profiles).find((p) => p.id === id);
	if (!src) return null;
	const copy = normalizeProfile({ ...src, id: undefined, name: `${src.name} (copy)` });
	profiles.update((list) => [...list, copy]);
	activeProfileId.set(copy.id);
	return copy.id;
}

/** Deletes a profile; the first remaining one becomes active. */
export function deleteProfile(id: string): void {
	profiles.update((list) => list.filter((p) => p.id !== id));
	const remaining = get(profiles);
	if (get(activeProfileId) === id) {
		activeProfileId.set(remaining[0]?.id ?? null);
	}
}

/** Overwrites fields of the given profile (shallow merge). */
export function updateProfile(id: string, patch: Partial<SipProfile>): void {
	profiles.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

/** Sets the active profile. */
export function setActiveProfile(id: string): void {
	activeProfileId.set(id);
}

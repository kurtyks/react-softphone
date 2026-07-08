// jsdom in recent Node does not expose localStorage without an extra flag.
// Provide a minimal in-memory implementation for tests that rely on persistence.
class MemoryStorage implements Storage {
	private store = new Map<string, string>();
	get length(): number {
		return this.store.size;
	}
	clear(): void {
		this.store.clear();
	}
	getItem(key: string): string | null {
		return this.store.has(key) ? this.store.get(key)! : null;
	}
	setItem(key: string, value: string): void {
		this.store.set(key, String(value));
	}
	removeItem(key: string): void {
		this.store.delete(key);
	}
	key(index: number): string | null {
		return Array.from(this.store.keys())[index] ?? null;
	}
}

const ls = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
if (typeof window !== 'undefined') {
	Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
}

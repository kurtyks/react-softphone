/**
 * Network change monitor. It combines several signals, since none is fully portable:
 *  - window 'online'/'offline' (everywhere),
 *  - navigator.connection 'change' + type/effectiveType (Chrome/Android; absent in Safari/Firefox desktop).
 *
 * Emits `onChange(reason)` when a change may require an ICE restart (e.g. WiFi -> LTE,
 * coming back online after a short offline). The orchestrator decides what to do.
 */

import { t } from '../i18n';

type NavigatorConnection = {
	type?: string;
	effectiveType?: string;
	addEventListener?: (type: 'change', cb: () => void) => void;
	removeEventListener?: (type: 'change', cb: () => void) => void;
};

export class NetworkMonitor {
	private onChange: (reason: string) => void;
	private connection: NavigatorConnection | null = null;
	private lastType = '';
	private lastEffectiveType = '';
	private wasOffline = false;
	private started = false;

	constructor(onChange: (reason: string) => void) {
		this.onChange = onChange;
	}

	start(): void {
		if (this.started || typeof window === 'undefined') return;
		this.started = true;

		window.addEventListener('online', this.handleOnline);
		window.addEventListener('offline', this.handleOffline);

		this.connection =
			(navigator as unknown as { connection?: NavigatorConnection }).connection ?? null;
		if (this.connection) {
			this.lastType = this.connection.type ?? '';
			this.lastEffectiveType = this.connection.effectiveType ?? '';
			this.connection.addEventListener?.('change', this.handleConnectionChange);
		}
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;
		window.removeEventListener('online', this.handleOnline);
		window.removeEventListener('offline', this.handleOffline);
		this.connection?.removeEventListener?.('change', this.handleConnectionChange);
		this.connection = null;
	}

	/** Current network description for diagnostics. */
	describe(): string {
		if (typeof navigator === 'undefined') return 'unknown';
		const online = navigator.onLine ? 'online' : 'offline';
		if (!this.connection) return online;
		const t = this.connection.type || this.connection.effectiveType || '?';
		return `${online} (${t})`;
	}

	private handleOnline = () => {
		if (this.wasOffline) {
			this.wasOffline = false;
			this.onChange(t('net.backOnline'));
		}
	};

	private handleOffline = () => {
		this.wasOffline = true;
	};

	private handleConnectionChange = () => {
		if (!this.connection) return;
		const type = this.connection.type ?? '';
		const eff = this.connection.effectiveType ?? '';
		if (type !== this.lastType || eff !== this.lastEffectiveType) {
			const from = `${this.lastType || this.lastEffectiveType || '?'}`;
			const to = `${type || eff || '?'}`;
			this.lastType = type;
			this.lastEffectiveType = eff;
			this.onChange(t('net.change', { from, to }));
		}
	};
}

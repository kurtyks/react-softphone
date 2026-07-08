import { writable } from './store';

export interface AppNotification {
    id: number;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timeout?: number; // in ms
}

export const notifications = writable<AppNotification[]>([]);

let nextId = 0;

export function addNotification(message: string, type: AppNotification['type'] = 'info', timeout: number = 3000) {
    const id = nextId++;
    notifications.update(n => [...n, { id, message, type, timeout }]);

    if (timeout > 0) {
        setTimeout(() => {
            removeNotification(id);
        }, timeout);
    }
}

export function removeNotification(id: number) {
    notifications.update(n => n.filter(notification => notification.id !== id));
}

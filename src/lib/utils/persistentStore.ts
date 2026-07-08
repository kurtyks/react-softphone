import { writable } from '../store';

// A simple persistent store utility
export function persistentStore<T>(key: string, startValue: T) {
    let data: T = startValue;
    if (typeof window !== 'undefined') {
        const storedValue = localStorage.getItem(key);
        if (storedValue) {
            try {
                data = JSON.parse(storedValue);
            } catch (e) {
                console.error(`Error parsing stored value for key "${key}":`, e);
                // Fallback to startValue if parsing fails
                data = startValue;
            }
        }
    }
    
    const store = writable<T>(data);

    store.subscribe(value => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.error(`Error saving value for key "${key}":`, e);
            }
        }
    });

    return store;
}

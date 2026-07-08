import { writable } from './store';
import { persistentStore } from './utils/persistentStore';

// Stores the string of the number being dialed
export const dialedNumber = writable('');

// Controls the visibility of the dialpad component
export const isDialpadVisible = writable(true);

// Represents the current call state: 'idle', 'calling', 'in-call', 'incoming'
export const callState = writable<'idle' | 'calling' | 'in-call' | 'incoming'>('idle');

// Incoming call details (caller — set by the softphone orchestrator)
export const incomingCall = writable<{ caller: string } | null>(null);

// Call history
export interface CallRecord {
    id: string;
    type: 'incoming' | 'outgoing' | 'missed';
    number: string;
    time: Date;
    duration: number; // in seconds
}
export const callHistory = persistentStore<CallRecord[]>('callHistory', []);

// Call Transfer state
export const isTransferring = writable(false);
export const transferTargetNumber = writable('');

// In-call state management
export const isMuted = writable(false);
export const isHeld = writable(false);
export const callDuration = writable(0); // in seconds

// SIP configuration has moved to profiles: $lib/profiles + $lib/sip/*


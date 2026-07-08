import { writable } from './store';
import { get } from './store';
import { persistentStore } from './utils/persistentStore';

export const mediaPermissionStatus = writable<'idle' | 'granted' | 'denied' | 'prompt'>('idle');
export const localStream = writable<MediaStream | null>(null);
export const availableMicrophones = writable<MediaDeviceInfo[]>([]);
export const selectedMicrophoneId = persistentStore<string | undefined>('selectedMicrophoneId', undefined);
export const microphoneVolume = writable<number>(0); // 0-100

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let volumeMeterInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Enumerates available audio input devices and updates the availableMicrophones store.
 */
export async function enumerateMicrophones(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn("MediaDevices API or enumerateDevices not available.");
        return;
    }
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(device => device.kind === 'audioinput');
        availableMicrophones.set(microphones);
        if (!get(selectedMicrophoneId) && microphones.length > 0) {
            selectedMicrophoneId.set(microphones[0].deviceId); // Select first by default
        }
    } catch (error) {
        console.error("Error enumerating devices:", error);
    }
}

/**
 * Requests microphone access from the user.
 * This is the ONLY function that should call getUserMedia.
 * @param deviceId Optional deviceId to request a specific microphone.
 * @returns Promise<boolean> - true if granted, false if denied/error.
 */
export async function requestMediaPermissions(deviceId?: string): Promise<boolean> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        console.warn("MediaDevices API not available in this environment.");
        mediaPermissionStatus.set('denied');
        return false;
    }

    mediaPermissionStatus.set('prompt'); // Set to prompt while waiting for user interaction/stream
    try {
        // Always stop any existing stream before requesting a new one
        const currentStream = get(localStream);
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            localStream.set(null);
            stopVolumeIndicator();
        }

        const constraints: MediaStreamConstraints = {
            audio: deviceId ? { deviceId: { exact: deviceId } } : true
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStream.set(stream);
        mediaPermissionStatus.set('granted');
        console.log("Microphone access granted.");
        startVolumeIndicator(stream);
        return true;
    } catch (error: any) {
        localStream.set(null);
        mediaPermissionStatus.set('denied');
        stopVolumeIndicator(); // Ensure indicator is stopped on denial/error
        console.error("Microphone access denied or error:", error);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            console.warn("User denied microphone access.");
        } else {
            console.error("Error accessing microphone:", error);
        }
        return false;
    }
}

/**
 * Checks current media permissions status without prompting the user.
 * If granted, it attempts to acquire the stream via requestMediaPermissions.
 * Updates mediaPermissionStatus store.
 */
export async function checkMediaPermissions(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
        mediaPermissionStatus.set('idle');
        return;
    }

    try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permissionStatus.state === 'granted') {
            mediaPermissionStatus.set('granted');
            // If permission is granted, but no stream is active, the UI (or explicit action) will call requestMediaPermissions.
            // We don't call getUserMedia here directly to avoid loops.
        } else if (permissionStatus.state === 'denied') {
            mediaPermissionStatus.set('denied');
            localStream.set(null);
            stopVolumeIndicator();
        } else if (permissionStatus.state === 'prompt') {
            mediaPermissionStatus.set('idle'); // User needs to explicitly click button
            localStream.set(null);
            stopVolumeIndicator();
        }
        permissionStatus.onchange = () => {
            checkMediaPermissions(); // Re-check on change
        };
    } catch (error) {
        console.error("Error querying media permissions:", error);
        mediaPermissionStatus.set('idle');
    }
}

/**
 * Starts the microphone volume indicator.
 * @param stream The MediaStream from getUserMedia.
 */
export function startVolumeIndicator(stream: MediaStream): void {
    if (!stream || stream.getAudioTracks().length === 0) {
        console.warn("No audio tracks in stream for volume indicator.");
        return;
    }
    stopVolumeIndicator(); // Ensure any previous indicator is stopped

    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    volumeMeterInterval = setInterval(() => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        microphoneVolume.set(Math.min(100, Math.max(0, Math.round(average * (100 / 128))))); // Scale to 0-100
    }, 100);
}

/**
 * Stops the microphone volume indicator and cleans up Web Audio API resources.
 */
export function stopVolumeIndicator(): void {
    if (volumeMeterInterval) {
        clearInterval(volumeMeterInterval);
        volumeMeterInterval = null;
    }
    if (analyser) {
        analyser.disconnect();
        analyser = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    microphoneVolume.set(0);
}

/**
 * Releases the microphone: stops all tracks, clears the stream and the level meter.
 * The permission grant is kept (status stays 'granted'), so re-acquiring for a call
 * does not prompt again. Call this whenever there is no active call, so the browser's
 * "recording" indicator turns off and the mic is not held while idle.
 */
export function releaseLocalStream(): void {
    const stream = get(localStream);
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        localStream.set(null);
    }
    stopVolumeIndicator();
}

// Initial enumeration of microphones and check permissions
enumerateMicrophones();
checkMediaPermissions(); // Call this once on module load

// Listen for device changes
if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    navigator.mediaDevices.ondevicechange = () => {
        enumerateMicrophones();
        // Re-check permissions and potentially re-request stream if selected device changed
        if (get(mediaPermissionStatus) === 'granted') {
            checkMediaPermissions();
        }
    };
}

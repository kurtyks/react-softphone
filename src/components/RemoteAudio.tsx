import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { remoteStream } from '@/lib/sip/softphone';
import { useStore } from '@/lib/useStore';

/**
 * Persistent remote-audio sink. Mounted once at the app root (outside the dialer ↔
 * in-call view switch), so playback survives navigation — mirroring the original's
 * single persistent <audio> element. Web-only; native would use react-native-webrtc.
 */
export function RemoteAudio() {
  const stream = useStore(remoteStream);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream]);

  if (Platform.OS !== 'web') return null;
  return <audio ref={ref} autoPlay style={{ display: 'none' }} />;
}

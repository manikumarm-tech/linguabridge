import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export interface Recording { base64: string; mimeType: string; durationMs: number }

const MAX_MS = 2 * 60_000;
const pickMime = () =>
  ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) ?? '';

/** Voice-message recorder. Web: MediaRecorder. Native: not yet (the composer keeps dictation there). */
export function useRecorder() {
  const supported = Platform.OS === 'web' && typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval>>();
  const done = useRef<((r: Recording | null) => void) | null>(null);

  const cleanup = () => {
    clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((tr) => tr.stop());
    rec.current = null;
    setRecording(false);
    setElapsed(0);
  };
  useEffect(() => () => { if (rec.current?.state === 'recording') rec.current.stop(); cleanup(); }, []);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickMime();
    const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = async () => {
      const durationMs = Date.now() - started.current;
      const blob = new Blob(chunks.current, { type: r.mimeType || mimeType || 'audio/webm' });
      const finish = done.current;
      done.current = null;
      cleanup();
      if (!finish) return;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      finish({ base64: btoa(bin), mimeType: blob.type, durationMs });
    };
    rec.current = r;
    started.current = Date.now();
    r.start(250);
    setRecording(true);
    timer.current = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= MAX_MS) r.stop();
    }, 250);
  };

  /** Stop and get the recording (null if cancelled). */
  const stop = () => new Promise<Recording | null>((resolve) => {
    if (!rec.current || rec.current.state !== 'recording') return resolve(null);
    done.current = resolve;
    rec.current.stop();
  });
  const cancel = () => { done.current = null; if (rec.current?.state === 'recording') rec.current.stop(); else cleanup(); };

  return { supported, recording, elapsed, start, stop, cancel };
}

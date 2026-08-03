import { useEffect, useRef, useState } from 'react';

type Props = {
  /** Mic is actively recording / Speak button held */
  micActive?: boolean;
  /** Leo / Butler is playing speech */
  leoSpeaking?: boolean;
};

function levelColor(n: number): string {
  if (n < 45) return 'var(--ok)';
  if (n < 75) return 'var(--warn)';
  return 'var(--danger)';
}

function Meter({ label, value, active }: { label: string; value: number; active: boolean }) {
  const v = Math.max(0, Math.min(100, active ? value : 0));
  return (
    <div className={`vu-meter ${active ? 'active' : ''}`} title={`${label}: ${Math.round(v)}`}>
      <span className="vu-label">{label}</span>
      <div className="vu-track">
        <div
          className="vu-fill"
          style={{
            width: `${v}%`,
            background: `linear-gradient(90deg, var(--ok) 0%, var(--ok) 45%, var(--warn) 70%, var(--danger) 100%)`,
            opacity: active ? 1 : 0.35,
          }}
        />
        <div
          className="vu-glow"
          style={{ left: `${v}%`, background: levelColor(v), opacity: active && v > 8 ? 1 : 0 }}
        />
      </div>
      <span className="vu-num">{active ? Math.round(v) : '—'}</span>
    </div>
  );
}

/**
 * Dual VU meters: user mic (Speak/STT) + Butler/Leo speech envelope.
 * Leo uses setInterval (not only rAF) so the bar keeps moving while TTS plays.
 */
export function AudioLevels({ micActive, leoSpeaking }: Props) {
  const [micLevel, setMicLevel] = useState(0);
  const [leoLevel, setLeoLevel] = useState(0);
  const rafRef = useRef(0);
  const leoTimerRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Mic analyser — only while actively listening
  useEffect(() => {
    let cancelled = false;
    const stopMic = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      analyserRef.current = null;
      void audioCtxRef.current?.close().catch(() => undefined);
      audioCtxRef.current = null;
      setMicLevel(0);
    };

    if (!micActive) {
      stopMic();
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = stream;
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.65;
        src.connect(analyser);
        analyserRef.current = analyser;
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          const level = Math.min(100, Math.pow(rms, 0.55) * 240);
          setMicLevel(level);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        let t = 0;
        const fake = () => {
          t += 0.12;
          setMicLevel(20 + Math.abs(Math.sin(t)) * 35 + Math.random() * 10);
          rafRef.current = requestAnimationFrame(fake);
        };
        rafRef.current = requestAnimationFrame(fake);
      }
    })();

    return () => {
      cancelled = true;
      stopMic();
    };
  }, [micActive]);

  // Butler speech envelope — setInterval keeps ticking even if rAF is throttled
  useEffect(() => {
    if (leoTimerRef.current) {
      window.clearInterval(leoTimerRef.current);
      leoTimerRef.current = 0;
    }
    if (!leoSpeaking) {
      setLeoLevel(0);
      return;
    }
    let t = 0;
    // Immediate first paint so bar is never blank for a frame
    setLeoLevel(42);
    leoTimerRef.current = window.setInterval(() => {
      t += 0.28;
      const syllable = Math.max(0, Math.sin(t * 3.6));
      const syllable2 = Math.max(0, Math.sin(t * 7.8 + 1.1));
      const breath = 0.4 + 0.2 * Math.sin(t * 0.85);
      const env = 32 + syllable * 50 * breath + syllable2 * 24 + Math.random() * 14;
      setLeoLevel(Math.min(100, env));
    }, 50);
    return () => {
      if (leoTimerRef.current) {
        window.clearInterval(leoTimerRef.current);
        leoTimerRef.current = 0;
      }
      setLeoLevel(0);
    };
  }, [leoSpeaking]);

  return (
    <div className="vu-pair" aria-label="Audio levels">
      <Meter label="You" value={micLevel} active={Boolean(micActive)} />
      <Meter label="Butler" value={leoLevel} active={Boolean(leoSpeaking)} />
    </div>
  );
}

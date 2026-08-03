import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelId } from '../lib/types';
import {
  BUTLER_CLIPS,
  IDLE_ACTION_GAP_MS,
  IDLE_REST,
  IDLE_REST_MIN_MS,
  WELCOME_AFTER_MS,
  isIdleAction,
  isPointClip,
  pickIdleAction,
  pickPointClip,
  type ButlerClipId,
} from '../lib/butlerVideos';

type Props = {
  speaking: boolean;
  thinking?: boolean;
  userListening?: boolean;
  micOn: boolean;
  butlerVoiceOn: boolean;
  onToggleMic: () => void;
  onToggleVoice: () => void;
  onReplay: () => void;
  onStopVoice?: () => void;
  pointingPanel?: PanelId | null;
  chatBusy?: boolean;
  lastEngagedAt?: number;
  welcomePulse?: number;
};

/**
 * Priority: point → speak → listen → welcome → think → idle (rest / action)
 */
function resolveClip(args: {
  pointClip: ButlerClipId | null;
  speaking: boolean;
  listening: boolean;
  welcoming: boolean;
  thinking: boolean;
  idleClip: ButlerClipId;
}): ButlerClipId {
  if (args.pointClip) return args.pointClip;
  if (args.speaking) return 'speak';
  if (args.listening) return 'listen';
  if (args.welcoming) return 'welcome';
  if (args.thinking) return 'think';
  return args.idleClip;
}

/**
 * Butler stage: video-only animation (no CSS bob / mouth glow).
 * Still image is poster under the video only.
 */
export function ButlerPanel({
  speaking,
  thinking,
  userListening,
  micOn,
  butlerVoiceOn,
  onToggleMic,
  onToggleVoice,
  onReplay,
  onStopVoice,
  pointingPanel,
  chatBusy,
  lastEngagedAt,
  welcomePulse,
}: Props) {
  const [idleClip, setIdleClip] = useState<ButlerClipId>(IDLE_REST);
  const [welcoming, setWelcoming] = useState(true);
  const [pointClip, setPointClip] = useState<ButlerClipId | null>(null);
  /** false only after real media error — not on transient play() rejects */
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pointTimer = useRef(0);
  const welcomeTimer = useRef(0);
  const actionTimer = useRef(0);
  const restUntil = useRef(0);
  const lastActionId = useRef<ButlerClipId | null>(null);
  const mountedWelcome = useRef(false);
  const pointGen = useRef(0);
  const playGen = useRef(0);

  const busy = Boolean(thinking || chatBusy);
  const listening = Boolean(userListening);
  const inPriority = Boolean(pointClip || speaking || listening || welcoming || busy);

  const clipId = resolveClip({
    pointClip,
    speaking,
    listening,
    welcoming,
    thinking: busy,
    idleClip,
  });

  const def = BUTLER_CLIPS[clipId];

  const endWelcome = useCallback(() => {
    setWelcoming(false);
    restUntil.current = Date.now() + IDLE_REST_MIN_MS;
    setIdleClip(IDLE_REST);
  }, []);

  const endPoint = useCallback(() => {
    setPointClip(null);
    restUntil.current = Date.now() + IDLE_REST_MIN_MS;
    setIdleClip(IDLE_REST);
  }, []);

  const endIdleAction = useCallback(() => {
    setIdleClip(IDLE_REST);
    restUntil.current = Date.now() + IDLE_REST_MIN_MS;
  }, []);

  // --- Session welcome on first mount (10s tray clip) ---
  useEffect(() => {
    if (mountedWelcome.current) return;
    mountedWelcome.current = true;
    setWelcoming(true);
    const ms = BUTLER_CLIPS.welcome.durationMs + 800;
    welcomeTimer.current = window.setTimeout(endWelcome, ms);
    return () => window.clearTimeout(welcomeTimer.current);
  }, [endWelcome]);

  // --- Welcome pulse (typing/send after quiet) ---
  useEffect(() => {
    if (!welcomePulse) return;
    setWelcoming(true);
    window.clearTimeout(welcomeTimer.current);
    welcomeTimer.current = window.setTimeout(endWelcome, BUTLER_CLIPS.welcome.durationMs + 800);
  }, [welcomePulse, endWelcome]);

  const lastRef = useRef(lastEngagedAt || 0);
  useEffect(() => {
    if (!lastEngagedAt) return;
    const prev = lastRef.current;
    lastRef.current = lastEngagedAt;
    if (prev > 0 && lastEngagedAt - prev > WELCOME_AFTER_MS) {
      setWelcoming(true);
      window.clearTimeout(welcomeTimer.current);
      welcomeTimer.current = window.setTimeout(endWelcome, BUTLER_CLIPS.welcome.durationMs + 800);
    }
  }, [lastEngagedAt, endWelcome]);

  // --- Point when a panel opens ---
  useEffect(() => {
    if (!pointingPanel) return;
    const gen = ++pointGen.current;
    const which = pickPointClip();
    setPointClip(which);
    setWelcoming(false);
    window.clearTimeout(pointTimer.current);
    const ms = BUTLER_CLIPS[which].durationMs + 400;
    pointTimer.current = window.setTimeout(() => {
      if (pointGen.current === gen) endPoint();
    }, ms);
  }, [pointingPanel, endPoint]);

  // --- Idle: rest most of the time; after gap, one-shot action ---
  useEffect(() => {
    if (inPriority) {
      window.clearTimeout(actionTimer.current);
      return;
    }
    if (isIdleAction(idleClip)) {
      const ms = BUTLER_CLIPS[idleClip].durationMs + 500;
      actionTimer.current = window.setTimeout(endIdleAction, ms);
      return () => window.clearTimeout(actionTimer.current);
    }

    const now = Date.now();
    const waitRest = Math.max(0, restUntil.current - now);
    const wait = waitRest + IDLE_ACTION_GAP_MS;
    actionTimer.current = window.setTimeout(() => {
      if (pointClip || speaking || listening || welcoming || busy) return;
      const next = pickIdleAction(lastActionId.current);
      lastActionId.current = next;
      setIdleClip(next);
    }, wait);

    return () => window.clearTimeout(actionTimer.current);
  }, [inPriority, idleClip, pointClip, speaking, listening, welcoming, busy, endIdleAction]);

  // Reset media-error flag when clip changes
  useEffect(() => {
    setVideoFailed(false);
  }, [clipId]);

  // Robust play: wait for canplay, retry — do NOT kill video on transient play() reject
  useEffect(() => {
    const el = videoRef.current;
    if (!el || videoFailed) return;
    const gen = ++playGen.current;

    const tryPlay = () => {
      if (playGen.current !== gen || !videoRef.current) return;
      const v = videoRef.current;
      const p = v.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Retry once after a short delay (common right after load())
          window.setTimeout(() => {
            if (playGen.current !== gen || !videoRef.current) return;
            void videoRef.current.play().catch(() => {
              /* keep poster; only onError sets videoFailed */
            });
          }, 120);
        });
      }
    };

    const onCanPlay = () => {
      if (playGen.current !== gen) return;
      tryPlay();
    };

    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('loadeddata', onCanPlay);
    // Force reload source for this clip
    el.load();
    // If already ready
    if (el.readyState >= 2) tryPlay();

    return () => {
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('loadeddata', onCanPlay);
    };
  }, [clipId, def.src, videoFailed]);

  const onVideoError = useCallback(() => {
    // Real decode/network failure — show poster only
    setVideoFailed(true);
  }, []);

  const onVideoEnded = useCallback(() => {
    const el = videoRef.current;
    if (clipId === IDLE_REST) {
      if (el) {
        try {
          el.pause();
          if (el.duration && Number.isFinite(el.duration)) {
            el.currentTime = Math.max(0, el.duration - 0.05);
          }
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (clipId === 'welcome') endWelcome();
    else if (isPointClip(clipId)) endPoint();
    else if (isIdleAction(clipId)) endIdleAction();
  }, [clipId, endWelcome, endPoint, endIdleAction]);

  const poseLabel = useMemo(() => def.label, [def.label]);
  const isPointing = isPointClip(clipId);
  // Cache-bust welcome so new tray file always loads after replace
  const videoSrc =
    clipId === 'welcome' ? `${def.src}?v=tray2` : def.src;

  return (
    <aside className="butler-col">
      <div className="butler-stage">
        <div className="butler-bg-static" aria-hidden />
        <div
          className={`butler-frame pose-${clipId} ${clipId === 'welcome' ? 'welcome-glow' : ''} ${
            isPointing ? 'pose-point' : ''
          }`}
        >
          <img
            className="butler-pose butler-pose-still"
            src={def.poster}
            alt="Butler Grok"
            draggable={false}
          />
          {!videoFailed ? (
            <video
              key={clipId + videoSrc}
              ref={videoRef}
              className="butler-pose butler-pose-video"
              src={videoSrc}
              poster={def.poster}
              muted
              playsInline
              autoPlay
              loop={def.loop}
              preload="auto"
              onError={onVideoError}
              onEnded={onVideoEnded}
            />
          ) : null}
        </div>
        <div className="butler-label">
          Butler Grok
          <span className="butler-pose-tag">{poseLabel}</span>
        </div>
      </div>
      <div className="butler-controls">
        <div className="toggle-row">
          <button
            type="button"
            className={micOn ? 'on' : ''}
            onClick={onToggleMic}
            title="Your microphone"
          >
            You: {micOn ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            className={butlerVoiceOn ? 'on' : ''}
            onClick={onToggleVoice}
            title="Butler voice (Leo TTS when connected)"
          >
            Butler: {butlerVoiceOn ? 'On' : 'Off'}
          </button>
        </div>
        {speaking && onStopVoice ? (
          <button
            type="button"
            className="full stop-voice"
            onClick={onStopVoice}
            title="Stop Butler speaking now"
          >
            ⏹ Stop voice
          </button>
        ) : (
          <button type="button" className="full" onClick={onReplay}>
            Replay last reply
          </button>
        )}
      </div>
    </aside>
  );
}

export function shouldWelcome(lastEngagedAt: number | undefined): boolean {
  if (!lastEngagedAt) return true;
  return Date.now() - lastEngagedAt > WELCOME_AFTER_MS;
}

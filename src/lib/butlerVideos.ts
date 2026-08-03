/**
 * Butler Grok 2.5D video catalog.
 *
 * Drop clips into `assets/video/`. Prefer H.264 MP4, muted, 720p+, 6s or 10s.
 * Action idles: play once then return to rest. Rest loop: seamless breathe.
 */

export type ButlerClipId =
  | 'idle_rest'
  | 'idle_look'
  | 'idle_watch'
  | 'idle_cuffs'
  | 'idle_nod'
  | 'idle_brush'
  | 'speak'
  | 'listen'
  | 'welcome'
  | 'point'
  | 'point_rise'
  | 'think';

export type ButlerClipDef = {
  id: ButlerClipId;
  src: string;
  srcAlt?: string;
  poster: string;
  /** Loop while this state is active */
  loop: boolean;
  label: string;
  /** Approximate duration ms (for one-shots) */
  durationMs: number;
};

/** Resting between action idles (breathing loop) */
export const IDLE_REST: ButlerClipId = 'idle_rest';

/**
 * Action idles — play once, then rest.
 * Weights: higher = more likely (watch is rarer).
 */
export const IDLE_ACTIONS: { id: ButlerClipId; weight: number }[] = [
  { id: 'idle_look', weight: 3 },
  { id: 'idle_cuffs', weight: 2 },
  { id: 'idle_nod', weight: 2 },
  { id: 'idle_brush', weight: 2 },
  { id: 'idle_watch', weight: 1 }, // rarer — was over-playing when looped
];

/** Minimum time at rest after an action before another action may start */
export const IDLE_REST_MIN_MS = 10_000;

/** Extra quiet time at rest before picking a random action (after rest min) */
export const IDLE_ACTION_GAP_MS = 25_000;

/** Welcome again if user returns after this quiet period */
export const WELCOME_AFTER_MS = 15 * 60 * 1000;

export const POINT_CLIPS: ButlerClipId[] = ['point', 'point_rise'];

export const BUTLER_CLIPS: Record<ButlerClipId, ButlerClipDef> = {
  idle_rest: {
    id: 'idle_rest',
    src: './video/butler-idle-breathe.mp4',
    poster: './butler-idle.jpg',
    // Play breathe once, then freeze (ButlerPanel pauses video on end)
    loop: false,
    label: 'At ease…',
    durationMs: 6000,
  },
  idle_look: {
    id: 'idle_look',
    src: './video/butler-idle-look.mp4',
    poster: './butler-look.jpg',
    loop: false,
    label: 'Looking around…',
    durationMs: 6500,
  },
  idle_watch: {
    id: 'idle_watch',
    src: './video/butler-idle-watch.mp4',
    poster: './butler-idle.jpg',
    loop: false,
    label: 'Checking the time…',
    durationMs: 10500,
  },
  idle_cuffs: {
    id: 'idle_cuffs',
    src: './video/butler-idle-cuffs.mp4',
    poster: './butler-idle.jpg',
    loop: false,
    label: 'Straightening cuffs…',
    durationMs: 6500,
  },
  idle_nod: {
    id: 'idle_nod',
    src: './video/butler-idle-nod.mp4',
    poster: './butler-idle.jpg',
    loop: false,
    label: 'A polite nod…',
    durationMs: 6500,
  },
  idle_brush: {
    id: 'idle_brush',
    src: './video/butler-idle-brush.mp4',
    poster: './butler-idle.jpg',
    loop: false,
    label: 'Brushing the coat…',
    durationMs: 6500,
  },
  speak: {
    id: 'speak',
    src: './video/butler-speak.mp4',
    poster: './butler-speak-open.jpg',
    loop: true,
    label: 'Speaking…',
    durationMs: 6000,
  },
  listen: {
    id: 'listen',
    src: './video/butler-listen.mp4',
    poster: './butler-listen.jpg',
    loop: true,
    label: 'Listening…',
    durationMs: 6000,
  },
  welcome: {
    id: 'welcome',
    src: './video/butler-welcome.mp4',
    poster: './butler-idle.jpg',
    loop: false,
    label: 'Serving Grok…',
    durationMs: 10500,
  },
  point: {
    id: 'point',
    src: './video/butler-point.mp4',
    poster: './butler-point.jpg',
    loop: false,
    label: 'Opening panel…',
    durationMs: 6500,
  },
  point_rise: {
    id: 'point_rise',
    src: './video/butler-point-rise.mp4',
    poster: './butler-point.jpg',
    loop: false,
    label: 'Opening panel…',
    durationMs: 7000,
  },
  think: {
    id: 'think',
    src: './video/butler-think.mp4',
    poster: './butler-think.jpg',
    loop: true,
    label: 'Thinking…',
    durationMs: 6000,
  },
};

/** Weighted random action idle (avoid repeating the same one) */
export function pickIdleAction(avoid?: ButlerClipId | null): ButlerClipId {
  const pool = IDLE_ACTIONS.filter((x) => x.id !== avoid);
  const list = pool.length ? pool : IDLE_ACTIONS;
  const total = list.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const item of list) {
    r -= item.weight;
    if (r <= 0) return item.id;
  }
  return list[list.length - 1].id;
}

export function pickPointClip(): ButlerClipId {
  return POINT_CLIPS[Math.floor(Math.random() * POINT_CLIPS.length)];
}

export function isPointClip(id: ButlerClipId): boolean {
  return id === 'point' || id === 'point_rise';
}

export function isIdleAction(id: ButlerClipId): boolean {
  return IDLE_ACTIONS.some((x) => x.id === id);
}

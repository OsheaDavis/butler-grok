import { useRef } from 'react';
import type { StaticPanelId } from '../lib/types';
import { PANEL_META } from '../lib/types';
import { MiniButlerWave } from './MiniButlerWave';

export type TileLine = {
  text: string;
  /** Show mini waving Butler (remind-me tasks) */
  wave?: boolean;
};

type Props = {
  id: StaticPanelId;
  x: number;
  y: number;
  lines: TileLine[];
  countLabel?: string;
  status?: 'ok' | 'warn' | null;
  onMove: (id: StaticPanelId, x: number, y: number) => void;
  onOpen: (id: StaticPanelId) => void;
};

export function HomeTile({ id, x, y, lines, countLabel, status, onMove, onOpen }: Props) {
  const meta = PANEL_META[id];
  const drag = useRef<{
    ox: number;
    oy: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);

  const showLines = lines.slice(0, 2);

  return (
    <div
      className="home-tile"
      style={{ left: x, top: y }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { ox: e.clientX, oy: e.clientY, sx: x, sy: y, moved: false };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.ox;
        const dy = e.clientY - drag.current.oy;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
        if (drag.current.moved) {
          onMove(
            id,
            Math.max(8, drag.current.sx + dx),
            Math.max(8, drag.current.sy + dy)
          );
        }
      }}
      onPointerUp={() => {
        const wasClick = drag.current && !drag.current.moved;
        drag.current = null;
        if (wasClick) onOpen(id);
      }}
    >
      <div className="tile-title">
        {status ? <span className={`tile-dot ${status}`} /> : <span className="tile-dot" />}
        {meta.short}
        {countLabel ? <span className="tile-count">{countLabel}</span> : null}
      </div>
      <div className="tile-lines">
        {showLines.length === 0 ? (
          <div className="tile-line muted">{meta.subtitle}</div>
        ) : (
          showLines.map((line, i) => (
            <div key={i} className="tile-line">
              {line.wave ? <MiniButlerWave title="Remind me" /> : null}
              <span className="tile-line-text">{line.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

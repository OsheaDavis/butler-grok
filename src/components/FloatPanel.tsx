import { useRef, type ReactNode } from 'react';
import type { PanelId } from '../lib/types';

type Props = {
  id: PanelId;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  onFocus: () => void;
  onClose: () => void;
  onChange: (next: { x: number; y: number; w: number; h: number }) => void;
  children: ReactNode;
};

export function FloatPanel({
  title,
  x,
  y,
  w,
  h,
  z,
  onFocus,
  onClose,
  onChange,
  children,
}: Props) {
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const resize = useRef<{ ox: number; oy: number; sw: number; sh: number } | null>(null);

  const snap = (nx: number, ny: number, nw: number, nh: number) => {
    const edge = 16;
    let x2 = nx;
    let y2 = ny;
    if (Math.abs(x2) < edge) x2 = 0;
    if (Math.abs(y2) < edge) y2 = 0;
    return { x: x2, y: y2, w: nw, h: nh };
  };

  return (
    <div
      className="float-panel"
      style={{ left: x, top: y, width: w, height: h, zIndex: z }}
      onMouseDown={onFocus}
    >
      <div
        className="float-head"
        onPointerDown={(e) => {
          // Buttons must receive clicks — do not capture/drag from them
          if ((e.target as HTMLElement).closest('button')) return;
          onFocus();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { ox: e.clientX, oy: e.clientY, sx: x, sy: y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const nx = drag.current.sx + (e.clientX - drag.current.ox);
          const ny = drag.current.sy + (e.clientY - drag.current.oy);
          onChange(snap(nx, ny, w, h));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <h3>{title}</h3>
        <button
          type="button"
          className="icon-btn"
          title="Minimize to home"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }}
        >
          ─
        </button>
        <button
          type="button"
          className="icon-btn float-close"
          title="Close to home"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClose();
          }}
        >
          ✕
        </button>
      </div>
      <div className="float-body">{children}</div>
      <div
        className="resize-handle"
        onPointerDown={(e) => {
          e.stopPropagation();
          onFocus();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          resize.current = { ox: e.clientX, oy: e.clientY, sw: w, sh: h };
        }}
        onPointerMove={(e) => {
          if (!resize.current) return;
          const nw = Math.max(280, resize.current.sw + (e.clientX - resize.current.ox));
          const nh = Math.max(200, resize.current.sh + (e.clientY - resize.current.oy));
          onChange({ x, y, w: nw, h: nh });
        }}
        onPointerUp={() => {
          resize.current = null;
        }}
      />
    </div>
  );
}

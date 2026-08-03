import { useMemo, useState } from 'react';

type Props = {
  content: string;
  role: 'user' | 'assistant' | 'system';
  /** Hide this image URL from the message (and Display if linked) */
  onRemoveImageUrl?: (url: string) => void;
};

type Part =
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'link'; url: string; label: string };

function parseContent(content: string): Part[] {
  const parts: Part[] = [];
  const re =
    /(!\[([^\]]*)\]\((https?:\/\/[^)\s]+|data:image\/[^)\s]+)\)|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>"')\]]+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) {
      parts.push({ type: 'text', text: content.slice(last, m.index) });
    }
    if (m[0].startsWith('![')) {
      parts.push({ type: 'image', alt: m[2] || 'Image', url: m[3] });
    } else if (m[0].startsWith('[')) {
      parts.push({ type: 'link', label: m[4], url: m[5] });
    } else {
      const url = m[6].replace(/[.,;:]+$/, '');
      const isImg =
        /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url) ||
        /picsum\.photos|i\.imgur|twimg|googleusercontent|wikimedia|upload\.wikimedia/i.test(url);
      if (isImg) parts.push({ type: 'image', alt: 'Image', url });
      else parts.push({ type: 'link', label: url, url });
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    parts.push({ type: 'text', text: content.slice(last) });
  }
  if (!parts.length) parts.push({ type: 'text', text: content });
  return parts;
}

/** Renders chat text with clickable links, image thumbs, and remove controls. */
export function ChatMessageView({ content, role, onRemoveImageUrl }: Props) {
  const parts = useMemo(() => parseContent(content), [content]);
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  return (
    <div className={`msg-body role-${role}`}>
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return (
            <span key={i} className="msg-text">
              {p.text}
            </span>
          );
        }
        if (p.type === 'image') {
          if (hidden[p.url]) return null;
          if (broken[p.url]) {
            return (
              <span key={i} className="msg-thumb-wrap broken">
                <a
                  className="msg-link"
                  href={p.url}
                  onClick={(e) => {
                    e.preventDefault();
                    void window.butler?.mediaOpenExternal?.(p.url);
                  }}
                >
                  {p.alt || p.url}
                </a>
                <button
                  type="button"
                  className="msg-thumb-remove"
                  title="Remove from chat view"
                  onClick={() => {
                    setHidden((h) => ({ ...h, [p.url]: true }));
                    onRemoveImageUrl?.(p.url);
                  }}
                >
                  −
                </button>
              </span>
            );
          }
          return (
            <span key={i} className="msg-thumb-wrap">
              <a
                href={p.url}
                title={p.alt}
                onClick={(e) => {
                  e.preventDefault();
                  void window.butler?.mediaOpenExternal?.(p.url);
                }}
              >
                <img
                  className="msg-thumb"
                  src={p.url}
                  alt={p.alt}
                  loading="lazy"
                  onError={() => setBroken((b) => ({ ...b, [p.url]: true }))}
                />
              </a>
              <button
                type="button"
                className="msg-thumb-remove"
                title="Remove picture"
                onClick={() => {
                  setHidden((h) => ({ ...h, [p.url]: true }));
                  onRemoveImageUrl?.(p.url);
                }}
              >
                −
              </button>
            </span>
          );
        }
        return (
          <a
            key={i}
            className="msg-link"
            href={p.url}
            title={p.url}
            onClick={(e) => {
              e.preventDefault();
              void window.butler?.mediaOpenExternal?.(p.url);
            }}
          >
            {p.label}
          </a>
        );
      })}
    </div>
  );
}

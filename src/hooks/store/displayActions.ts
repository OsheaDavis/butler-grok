import type { AppData, DisplayItem } from '../../lib/types';
import { LIMITS } from '../../lib/limits';
import { uid } from '../../lib/id';
import { extractMediaFromText, mediaToDisplayItems } from '../../lib/mediaExtract';

export function ingestDisplayFromReply(d: AppData, text: string): {
  next: AppData;
  added: DisplayItem[];
  projectId: string | null;
} {
  const extracted = extractMediaFromText(text);
  if (!extracted.length) return { next: d, added: [], projectId: null };
  const conv = d.conversations.find((c) => c.id === d.activeConversationId);
  const projectId = d.activeProjectId || conv?.projectId || null;
  const items = mediaToDisplayItems(extracted, { projectId });
  const prev = d.displayItems || [];
  const existing = new Set(prev.map((p) => p.src.slice(0, 200)));
  const fresh = items.filter((i) => !existing.has(i.src.slice(0, 200)));
  if (!fresh.length) return { next: d, added: [], projectId };
  return {
    projectId,
    added: items,
    next: {
      ...d,
      displayItems: [...fresh, ...prev].slice(0, LIMITS.displayItems),
      activeDisplayId: fresh[0].id,
    },
  };
}

export function displayItemsFromManualUrl(url: string): DisplayItem[] {
  const extracted = extractMediaFromText(
    url.includes('://') || url.startsWith('data:') ? url : `https://${url}`
  );
  let items = mediaToDisplayItems(extracted);
  if (!items.length) {
    const now = new Date().toISOString();
    items = [
      {
        id: uid('disp'),
        kind: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'video' : 'image',
        src: url,
        title: 'Manual media',
        createdAt: now,
        source: 'manual',
      },
    ];
  } else {
    items = items.map((i) => ({ ...i, source: 'manual' as const }));
  }
  return items;
}

export function prependDisplayItems(d: AppData, items: DisplayItem[]): AppData {
  if (!items.length) return d;
  return {
    ...d,
    displayItems: [
      ...items.map((i) => ({
        ...i,
        projectId: d.activeProjectId,
        vote: i.vote || ('pending' as const),
      })),
      ...(d.displayItems || []),
    ].slice(0, LIMITS.displayItems),
    activeDisplayId: items[0].id,
  };
}

export function displayItemsFromPaths(paths: string[]): DisplayItem[] {
  const now = new Date().toISOString();
  return paths
    .filter(Boolean)
    .map((p) => {
      const lower = p.toLowerCase();
      const kind: DisplayItem['kind'] = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)
        ? 'video'
        : /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(lower)
          ? 'image'
          : 'image';
      const name = p.split(/[/\\]/).pop() || 'Dropped file';
      const src = p.startsWith('http') || p.startsWith('file:') || p.startsWith('data:') ? p : p;
      return {
        id: uid('disp'),
        kind,
        src,
        displaySrc: src.startsWith('data:') ? src : undefined,
        title: name,
        createdAt: now,
        source: 'manual' as const,
      };
    });
}

export function removeDisplayItemFromData(d: AppData, id: string): AppData {
  const displayItems = (d.displayItems || []).filter((i) => i.id !== id);
  const activeDisplayId =
    d.activeDisplayId === id ? displayItems[0]?.id || null : d.activeDisplayId;
  return { ...d, displayItems, activeDisplayId };
}

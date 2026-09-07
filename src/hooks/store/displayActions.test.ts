import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../lib/limits';
import { DEFAULT_APP_DATA, type DisplayItem } from '../../lib/types';
import {
  displayItemsFromManualUrl,
  displayItemsFromPaths,
  ingestDisplayFromReply,
  prependDisplayItems,
  removeDisplayItemFromData,
} from './displayActions';

function item(partial: Partial<DisplayItem> & Pick<DisplayItem, 'id' | 'src'>): DisplayItem {
  return {
    kind: 'image',
    title: partial.title || 'Item',
    createdAt: '2026-09-07T00:00:00.000Z',
    source: 'chat',
    ...partial,
  };
}

describe('ingestDisplayFromReply', () => {
  it('returns the same data when the reply has no media', () => {
    const result = ingestDisplayFromReply(DEFAULT_APP_DATA, 'Just text, no pictures.');
    expect(result.added).toEqual([]);
    expect(result.next).toBe(DEFAULT_APP_DATA);
  });

  it('pulls markdown images into Display and scopes them to the active project', () => {
    const data = {
      ...DEFAULT_APP_DATA,
      activeProjectId: 'pride',
    };
    const result = ingestDisplayFromReply(data, 'See ![cat](https://example.com/cat.png)');
    expect(result.projectId).toBe('pride');
    expect(result.added).toHaveLength(1);
    expect(result.added[0].kind).toBe('image');
    expect(result.added[0].src).toBe('https://example.com/cat.png');
    expect(result.next.displayItems[0].projectId).toBe('pride');
    expect(result.next.activeDisplayId).toBe(result.next.displayItems[0].id);
  });

  it('skips a URL that is already in Display', () => {
    const existing = item({ id: 'old', src: 'https://example.com/cat.png', projectId: 'pride' });
    const data = { ...DEFAULT_APP_DATA, displayItems: [existing], activeDisplayId: 'old' };
    const result = ingestDisplayFromReply(data, 'Again ![cat](https://example.com/cat.png)');
    expect(result.next.displayItems).toEqual([existing]);
    expect(result.added).toEqual([]);
  });
});

describe('displayItemsFromManualUrl / displayItemsFromPaths', () => {
  it('classifies a video URL and a dropped image path', () => {
    const videos = displayItemsFromManualUrl('https://files.example.com/clip.mp4');
    expect(videos[0].kind).toBe('video');
    expect(videos[0].source).toBe('manual');

    const dropped = displayItemsFromPaths(['C:\\\\Art\\\\lion.png', '']);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].kind).toBe('image');
    expect(dropped[0].title).toBe('lion.png');
    expect(dropped[0].source).toBe('manual');
  });
});

describe('prependDisplayItems + removeDisplayItemFromData', () => {
  it('stamps the active project, pending vote, and FIFO cap', () => {
    const incoming = item({ id: 'new', src: 'https://example.com/new.png' });
    const prev = Array.from({ length: LIMITS.displayItems }, (_, i) =>
      item({ id: `old-${i}`, src: `https://example.com/${i}.png` })
    );
    const next = prependDisplayItems(
      { ...DEFAULT_APP_DATA, activeProjectId: 'p1', displayItems: prev },
      [incoming]
    );
    expect(next.displayItems).toHaveLength(LIMITS.displayItems);
    expect(next.displayItems[0].id).toBe('new');
    expect(next.displayItems[0].projectId).toBe('p1');
    expect(next.displayItems[0].vote).toBe('pending');
    expect(next.activeDisplayId).toBe('new');
    expect(next.displayItems.some((i) => i.id === `old-${LIMITS.displayItems - 1}`)).toBe(false);
  });

  it('removes an item and moves the active id when needed', () => {
    const a = item({ id: 'a', src: 'https://example.com/a.png' });
    const b = item({ id: 'b', src: 'https://example.com/b.png' });
    const next = removeDisplayItemFromData(
      { ...DEFAULT_APP_DATA, displayItems: [a, b], activeDisplayId: 'a' },
      'a'
    );
    expect(next.displayItems.map((i) => i.id)).toEqual(['b']);
    expect(next.activeDisplayId).toBe('b');
  });
});

import type { DisplayItem } from './types';
import { uid } from './id';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v)(\?|$)/i;

function looksLikeImage(url: string): boolean {
  if (url.startsWith('data:image/')) return true;
  if (url.startsWith('file:') && IMAGE_EXT.test(url)) return true;
  if (IMAGE_EXT.test(url)) return true;
  if (/[?&](format|fm)=(png|jpg|jpeg|webp)/i.test(url)) return true;
  // Common image CDNs without file extensions
  if (
    /picsum\.photos|i\.imgur\.com|images\.unsplash\.com|pbs\.twimg\.com|media\.x\.com|lh3\.googleusercontent|upload\.wikimedia\.org/i.test(
      url
    )
  )
    return true;
  return false;
}

function looksLikeVideo(url: string): boolean {
  if (url.startsWith('data:video/')) return true;
  if (VIDEO_EXT.test(url)) return true;
  return false;
}

/**
 * Pull image/video/page URLs from assistant markdown / plain text so Display can show them.
 * Page links (not direct files) are kept as kind "link".
 */
export function extractMediaFromText(
  text: string
): Omit<DisplayItem, 'id' | 'createdAt' | 'source'>[] {
  const found: Omit<DisplayItem, 'id' | 'createdAt' | 'source'>[] = [];
  const seen = new Set<string>();

  const push = (kind: DisplayItem['kind'], src: string, title: string) => {
    const key = src.slice(0, 240);
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ kind, src: src.trim(), title: (title || kind).slice(0, 100) });
  };

  // Markdown images: ![alt](url)
  const mdImg = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(text))) {
    const alt = m[1] || 'Image';
    const url = m[2];
    if (looksLikeVideo(url)) push('video', url, alt);
    else push('image', url, alt);
  }

  // Markdown links: [label](url)
  const mdLink = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  while ((m = mdLink.exec(text))) {
    const label = m[1];
    const url = m[2];
    if (looksLikeVideo(url)) push('video', url, label);
    else if (looksLikeImage(url)) push('image', url, label);
    else push('link', url, label);
  }

  // HTML <img src="...">
  const htmlImg = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((m = htmlImg.exec(text))) {
    push('image', m[1], 'Image');
  }

  // HTML <video src="..."> or <source src="...">
  const htmlVid = /<(?:video|source)[^>]+src=["']([^"']+)["']/gi;
  while ((m = htmlVid.exec(text))) {
    push('video', m[1], 'Video');
  }

  // Bare URLs
  const urlRe =
    /(https?:\/\/[^\s<>"')\]]+|data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|file:\/\/\/[^\s<>"')\]]+)/gi;
  while ((m = urlRe.exec(text))) {
    const url = m[1].replace(/[.,;:]+$/, '');
    if (looksLikeVideo(url)) push('video', url, 'Video from chat');
    else if (looksLikeImage(url) || url.startsWith('data:image/'))
      push('image', url, 'Image from chat');
    else if (/^https?:\/\//i.test(url)) push('link', url, 'Link from chat');
  }

  return found;
}

export function mediaToDisplayItems(
  extracted: ReturnType<typeof extractMediaFromText>,
  opts?: { projectId?: string | null; libraryFolderId?: string | null }
): DisplayItem[] {
  const now = new Date().toISOString();
  return extracted.map((e) => ({
    id: uid('disp'),
    kind: e.kind,
    src: e.src,
    title: e.title,
    createdAt: now,
    source: 'chat' as const,
    projectId: opts?.projectId ?? null,
    libraryFolderId: opts?.libraryFolderId ?? null,
    vote: 'pending' as const,
  }));
}

/** Normalize older saved data so Phase A fields always exist. */
export function normalizeAppDataDisplayAndProjects<
  T extends {
    projects?: { libraryFolders?: unknown }[];
    displayItems?: Partial<DisplayItem>[];
    chatAttachment?: unknown;
  },
>(data: T): T {
  const projects = (data.projects || []).map((p) => ({
    ...p,
    libraryFolders: Array.isArray(p.libraryFolders) ? p.libraryFolders : [],
  }));
  const displayItems = (data.displayItems || []).map((i) => ({
    ...i,
    projectId: i.projectId ?? null,
    libraryFolderId: i.libraryFolderId ?? null,
    vote: i.vote || 'pending',
  }));
  return {
    ...data,
    projects,
    displayItems,
    chatAttachment: data.chatAttachment ?? null,
  };
}

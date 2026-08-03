export type SlashResult =
  | { type: 'help'; text: string }
  | { type: 'open-panel'; panel: string; message: string }
  | { type: 'new-chat'; message: string }
  | { type: 'settings'; message: string }
  | { type: 'terminal'; action: 'update' | 'update-alpha' | 'marketplace' | 'grok'; message: string }
  | { type: 'imagine'; prompt: string }
  | { type: 'save-chat'; message: string }
  | { type: 'sessions'; message: string }
  | { type: 'project'; name: string | null; message: string }
  | { type: 'vote'; vote: 'liked' | 'passed' | 'chosen'; message: string }
  | { type: 'review'; message: string }
  | { type: 'unknown'; message: string };

const HELP = `Butler Grok slash commands:

— Butler —
/help — this list
/new — start a new conversation
/save — save the current chat
/sessions — list recent & saved chats
/project [name] — set active project (or list projects)
/imagine <prompt> — generate an image (API key, Mode B/C)
/like · /pass · /keep — vote on the current Display item
/review — open Display for the active project

— Open panels —
/display · /projects · /folders · /tasks · /settings

— Grok Build (terminal helper) —
/update — new tab: grok update --stable
/update-alpha — new tab: grok update --alpha
/marketplace — Marketplace + Grok tip
/start-grok — open Grok Build

Tip: Type / for the menu. Casual chat still works (“create me an image…”, “resume Her Pride”).`;

/** Shown when the user types / in chat (Grok Build–style menu). */
export const SLASH_MENU: { cmd: string; hint: string; group?: string }[] = [
  { cmd: '/help', hint: 'List Butler commands', group: 'Butler' },
  { cmd: '/imagine ', hint: 'Generate an image (xAI Imagine)', group: 'Butler' },
  { cmd: '/project ', hint: 'Set active project by name', group: 'Butler' },
  { cmd: '/save', hint: 'Save current conversation', group: 'Butler' },
  { cmd: '/sessions', hint: 'List recent & saved chats', group: 'Butler' },
  { cmd: '/like', hint: 'Like current Display item', group: 'Butler' },
  { cmd: '/pass', hint: 'Pass on current Display item', group: 'Butler' },
  { cmd: '/keep', hint: 'Choose current Display item', group: 'Butler' },
  { cmd: '/review', hint: 'Open Display for active project', group: 'Butler' },
  { cmd: '/new', hint: 'Start a new conversation', group: 'Butler' },
  { cmd: '/display', hint: 'Open Display panel', group: 'Open' },
  { cmd: '/projects', hint: 'Open Projects panel', group: 'Open' },
  { cmd: '/folders', hint: 'Open Folders panel', group: 'Open' },
  { cmd: '/tasks', hint: 'Open Tasks panel', group: 'Open' },
  { cmd: '/settings', hint: 'Open Settings', group: 'Open' },
  { cmd: '/marketplace', hint: 'Marketplace + Grok terminal tip', group: 'Grok Build' },
  { cmd: '/update', hint: 'Terminal: grok update --stable', group: 'Grok Build' },
  { cmd: '/update-alpha', hint: 'Terminal: grok update --alpha', group: 'Grok Build' },
  { cmd: '/start-grok', hint: 'Open Grok Build terminal', group: 'Grok Build' },
];

export function filterSlashMenu(draft: string): { cmd: string; hint: string; group?: string }[] {
  if (!draft.startsWith('/')) return [];

  const lower = draft.toLowerCase();

  if (lower.startsWith('/imagine ') && draft.length > '/imagine '.length) return [];
  if (lower.startsWith('/project ') && draft.length > '/project '.length) return [];

  if (draft === '/' || draft === '/ ') return SLASH_MENU;

  return SLASH_MENU.filter((item) => {
    const c = item.cmd.toLowerCase().trim();
    return c.startsWith(lower.trim()) || c.includes(lower.trim().slice(1));
  });
}

/**
 * Parse chat text starting with /. Returns null if not a slash command.
 */
export function parseSlashCommand(raw: string): SlashResult | null {
  const text = raw.trim();
  if (!text.startsWith('/')) return null;

  const body = text.slice(1).trim();
  const space = body.indexOf(' ');
  const cmd = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const arg = space === -1 ? '' : body.slice(space + 1).trim();

  switch (cmd) {
    case 'help':
    case '?':
      return { type: 'help', text: HELP };
    case 'new':
    case 'newchat':
      return { type: 'new-chat', message: 'Started a new conversation.' };
    case 'settings':
      return { type: 'settings', message: 'Opened Settings.' };
    case 'display':
      return {
        type: 'open-panel',
        panel: 'display',
        message:
          'Opened **General Display** (media not in a project). For a project’s pictures, use **Projects → Open Display** or `/review` with an active project.',
      };
    case 'projects':
    case 'project-list':
      if (!arg) {
        return {
          type: 'open-panel',
          panel: 'projects',
          message: 'Opened Projects. Use `/project Name` to set the active project.',
        };
      }
      return {
        type: 'project',
        name: arg,
        message: `Looking for project “${arg}”…`,
      };
    case 'project':
    case 'proj':
      return {
        type: 'project',
        name: arg || null,
        message: arg
          ? `Looking for project “${arg}”…`
          : 'List projects or set one with `/project Name`.',
      };
    case 'folders':
      return { type: 'open-panel', panel: 'folders', message: 'Opened Folders.' };
    case 'tasks':
    case 'task':
      return { type: 'open-panel', panel: 'tasks', message: 'Opened Tasks.' };
    case 'save':
    case 'savechat':
      return { type: 'save-chat', message: 'Saving this conversation…' };
    case 'sessions':
    case 'chats':
    case 'history':
      return { type: 'sessions', message: 'Here are your Butler chats:' };
    case 'like':
    case 'yes':
    case 'thumbsup':
      return {
        type: 'vote',
        vote: 'liked',
        message: 'Marked the current Display item as **liked**.',
      };
    case 'pass':
    case 'no':
    case 'dislike':
    case 'skip':
      return {
        type: 'vote',
        vote: 'passed',
        message: 'Marked the current Display item as **passed**.',
      };
    case 'keep':
    case 'choose':
    case 'pick':
    case 'chosen':
      return {
        type: 'vote',
        vote: 'chosen',
        message: 'Marked the current Display item as **chosen** (the pick).',
      };
    case 'review':
      return {
        type: 'review',
        message: 'Opening Display in review mode for the active project…',
      };
    case 'market':
    case 'marketplace':
    case 'plugins':
      return {
        type: 'terminal',
        action: 'marketplace',
        message:
          'Opened Marketplace + a helper window.\n\n**Advanced install/auth in Grok Build:**\n1. Open a **new tab** (Ctrl+Shift+T or +)\n2. Paste (command `grok` is copied) → Enter\n3. In Grok, press **/** and open **Marketplace**\n4. Follow the TUI steps to install / update / sign in\n\nSimple installs: use the Install buttons in Butler’s Marketplace panel.',
      };
    case 'update':
      return {
        type: 'terminal',
        action: 'update',
        message:
          'Command **copied**: `grok update --stable`\n\n1. Open a **new tab** (Ctrl+Shift+T or +)\n2. Right-click to **paste**\n3. Press **Enter**',
      };
    case 'update-alpha':
    case 'updatealpha':
    case 'alpha':
      return {
        type: 'terminal',
        action: 'update-alpha',
        message:
          'Command **copied**: `grok update --alpha`\n\n1. Open a **new tab**\n2. Paste → Enter',
      };
    case 'start-grok':
    case 'start':
    case 'grok':
      return {
        type: 'terminal',
        action: 'grok',
        message:
          'Command **copied**: `grok`\n\n1. Open a **new tab**\n2. Paste → Enter to start Grok Build',
      };
    case 'imagine':
    case 'image':
    case 'img':
      if (!arg) {
        return {
          type: 'unknown',
          message: 'Usage: /imagine a cat wearing sunglasses',
        };
      }
      return { type: 'imagine', prompt: arg };
    default:
      return {
        type: 'unknown',
        message: `Unknown command /${cmd}. Type /help for the list.`,
      };
  }
}

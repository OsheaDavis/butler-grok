import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_DATA, DEFAULT_SETTINGS, type Conversation } from '../../lib/types';
import {
  appendChatMessages,
  ensureActiveConversationData,
  localButlerReplyText,
} from './conversationActions';

function conv(partial: Partial<Conversation> & Pick<Conversation, 'id'>): Conversation {
  return {
    title: 'New chat',
    messages: [],
    updatedAt: '2026-09-07T00:00:00.000Z',
    saved: false,
    ...partial,
  };
}

describe('ensureActiveConversationData', () => {
  it('reuses the active conversation when it still exists', () => {
    const existing = conv({ id: 'c1', title: 'Kept' });
    const data = {
      ...DEFAULT_APP_DATA,
      conversations: [existing],
      activeConversationId: 'c1',
    };
    const result = ensureActiveConversationData(data);
    expect(result.next).toBe(data);
    expect(result.conversation).toBe(existing);
  });

  it('creates a new chat when none is active and links the current project', () => {
    const data = {
      ...DEFAULT_APP_DATA,
      activeProjectId: 'p9',
      selectedFolderIdsForNewChat: ['f1'],
    };
    const result = ensureActiveConversationData(data);
    expect(result.conversation.title).toBe('New chat');
    expect(result.conversation.projectId).toBe('p9');
    expect(result.conversation.folderIds).toEqual(['f1']);
    expect(result.next.activeConversationId).toBe(result.conversation.id);
    expect(result.next.conversations[0]).toBe(result.conversation);
  });
});

describe('appendChatMessages', () => {
  it('appends a user/assistant pair, titles the first turn, and clears the draft', () => {
    const prev = {
      ...DEFAULT_APP_DATA,
      draft: 'leftover',
      conversations: [conv({ id: 'c1', messages: [] })],
      activeConversationId: 'c1',
    };
    const next = appendChatMessages(prev, 'Hello butler', 'At your service', null, '  think  ');
    const active = next.conversations.find((c) => c.id === 'c1');
    expect(next.draft).toBe('');
    expect(active?.title).toBe('Hello butler');
    expect(active?.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(active?.messages[1].content).toBe('At your service');
    expect(active?.messages[1].thinking).toBe('think');
    expect(active?.projectId).toBeNull();
  });

  it('creates a conversation when the active id is missing', () => {
    const next = appendChatMessages(DEFAULT_APP_DATA, 'First', 'Reply');
    expect(next.conversations).toHaveLength(1);
    expect(next.activeConversationId).toBe(next.conversations[0].id);
    expect(next.conversations[0].messages).toHaveLength(2);
  });
});

describe('localButlerReplyText', () => {
  it('prefers an action acknowledgement over a canned reply', () => {
    expect(
      localButlerReplyText('hi', 'Opened Projects.', DEFAULT_SETTINGS, false, null)
    ).toBe('Opened Projects.');
  });

  it('explains demo mode and echoes a short user quote', () => {
    const text = localButlerReplyText('resume Her Pride', null, DEFAULT_SETTINGS, false, {
      id: 'p1',
      name: 'Her Pride',
      instructions: '',
      conversationIds: [],
      folderIds: [],
      libraryFolders: [],
      resumeNote: '',
      updatedAt: '2026-09-07T00:00:00.000Z',
    });
    expect(text).toContain('project: Her Pride');
    expect(text).toContain('Demo mode is on');
    expect(text).toContain('resume Her Pride');
  });

  it('tells Mode A users to start Grok when it is not detected', () => {
    const text = localButlerReplyText(
      'hello',
      null,
      { ...DEFAULT_SETTINGS, demoMode: false, connectionMode: 'A' },
      false,
      null
    );
    expect(text).toContain('Mode A');
    expect(text).toContain('Start Grok');
  });
});

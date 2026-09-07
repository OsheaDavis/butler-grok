import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { AppData, ChatMessage, PanelId, Project, Settings } from '../../lib/types';
import { uid } from '../../lib/id';
import { assistantAckForAction, detectUiAction } from '../../lib/intent';
import { buildSystemPrompt, xaiChatCompletionStream } from '../../lib/xaiChat';
import {
  buildEditPromptFromAttachment,
  detectAttachedImageEdit,
  detectImagePrompt,
  generateXaiImage,
} from '../../lib/xaiImage';
import { resolveChatPrompt, type SlashChatCtx } from './slashChat';

export type SendChatCtx = SlashChatCtx & {
  chatBusy: boolean;
  noteUserActivity: () => void;
  ensureActiveConversation: () => unknown;
  streamOwnerRef: MutableRefObject<boolean>;
  streamAbortRef: MutableRefObject<AbortController | null>;
  setChatBusy: (busy: boolean) => void;
  setLiveThinking: (text: string) => void;
  setLiveReply: (text: string) => void;
  setRetainedThinking: (text: string) => void;
  publishLive: (state: {
    busy?: boolean;
    thinking?: string;
    reply?: string;
    retainedThinking?: string;
  }) => void;
  settingsRef: MutableRefObject<Settings>;
  hasApiKeyRef: MutableRefObject<boolean>;
  ingestMediaFromReply: (text: string) => void;
  setApiOk: (ok: boolean) => void;
  setLeoReady: (ok: boolean) => void;
  speakReply: (reply: string) => void;
  beginStreamingSpeech: () => boolean;
  pushStreamingSpeech: (full: string) => void;
  finishStreamingSpeech: (full: string) => boolean;
  resetStreamingSpeech: () => void;
  setLastAssistantText: (text: string) => void;
  localButlerReply: (userText: string, actionAck: string | null, project?: Project | null) => string;
  speechActiveRef: MutableRefObject<boolean>;
  voiceCancelledRef: MutableRefObject<boolean>;
  leoQueueRef: MutableRefObject<{ heardAudio: () => boolean }>;
};

export async function runSendChat(ctx: SendChatCtx, text: string): Promise<void> {
  const {
    chatBusy,
    noteUserActivity,
    ensureActiveConversation,
    streamOwnerRef,
    streamAbortRef,
    setChatBusy,
    setLiveThinking,
    setLiveReply,
    setRetainedThinking,
    publishLive,
    dataRef,
    setData,
    settingsRef,
    hasApiKeyRef,
    appendMessages,
    ingestMediaFromReply,
    setApiOk,
    setLeoReady,
    speakReply,
    beginStreamingSpeech,
    pushStreamingSpeech,
    finishStreamingSpeech,
    resetStreamingSpeech,
    setLastAssistantText,
    localButlerReply,
    speechActiveRef,
    voiceCancelledRef,
    leoQueueRef,
    openPanel,
  } = ctx;

  const trimmed = text.trim();
  if (!trimmed || chatBusy) return;
  noteUserActivity();

  const prompt = resolveChatPrompt(ctx, trimmed);
  if (prompt.status === 'handled') return;
  let imagePrompt = prompt.imagePrompt;

      ensureActiveConversation();
      streamOwnerRef.current = true;
      setChatBusy(true);
      setLiveThinking('');
      setLiveReply('');
      setRetainedThinking('');
      publishLive({ busy: true, thinking: '', reply: '', retainedThinking: '' });
      streamAbortRef.current?.abort();
      const abort = new AbortController();
      streamAbortRef.current = abort;

      // Attachment from Display (bring to chat / drag) — prefer edit/recreate over new invent
      const attachment = dataRef.current.chatAttachment;
      const attachEdit = attachment ? detectAttachedImageEdit(trimmed) : null;
      if (attachment && attachEdit) {
        imagePrompt = buildEditPromptFromAttachment(attachEdit, attachment);
      } else if (attachment && !imagePrompt) {
        // User has attachment + invent-style prompt → still ground on attachment if they say "image"
        if (detectImagePrompt(trimmed) || /image|picture|photo|recreate|modify/i.test(trimmed)) {
          imagePrompt = buildEditPromptFromAttachment(trimmed, attachment);
        }
      }

      // --- Image generation (Imagine API) ---
      if (imagePrompt) {
        const s = settingsRef.current;
        const canCloud =
          !s.demoMode &&
          (s.connectionMode === 'B' || s.connectionMode === 'C') &&
          hasApiKeyRef.current;
        setLiveThinking(
          attachment
            ? 'Recreating from your selected Display image…'
            : 'Generating image with xAI Imagine…'
        );
        if (!canCloud) {
          const reply =
            'To generate images, turn **Demo mode Off**, use Mode **B** or **C**, and paste your xAI API key in Settings. Then try again or use `/imagine your prompt`.';
          appendMessages(trimmed, reply);
          setChatBusy(false);
          setLiveThinking('');
          streamOwnerRef.current = false;
          return;
        }
        // User-visible message includes the attachment so history shows what was edited
        const userVisible = attachment
          ? `${trimmed}\n\n_Using attached Display ${attachment.kind}: **${attachment.title}**_\n\n![Attached reference](${attachment.displaySrc || attachment.src})`
          : trimmed;
        const gen = await generateXaiImage(undefined, imagePrompt);
        if (gen.ok) {
          const reply = attachment
            ? `Here’s a new version based on **your selected image** (“${attachment.title}”), with your changes:\n\n![Generated](${gen.url})\n\n_Model: ${gen.model}_\n\n_Reference was attached from Display so we know which one you meant._`
            : `Here's your generated image:\n\n![Generated](${gen.url})\n\n_Model: ${gen.model}_`;
          appendMessages(userVisible, reply);
          setData((d) => ({ ...d, chatAttachment: null, draft: '' }));
          ingestMediaFromReply(reply);
          setApiOk(true);
          speakReply(
            attachment
              ? 'I remade the image you selected with your changes. It is in chat and Display.'
              : 'Your image is ready in chat and Display.'
          );
        } else {
          const reply = `I couldn't generate that image: ${gen.error}\n\nCheck that your xAI key has Imagine / image generation access.`;
          appendMessages(userVisible, reply);
          setApiOk(false);
        }
        setLiveThinking('');
        setLiveReply('');
        setChatBusy(false);
        streamOwnerRef.current = false;
        publishLive({ busy: false, thinking: '', reply: '' });
        return;
      }

      // Normal chat with attachment still in context (not an image-gen request)
      if (attachment) {
        // Fall through to chat, but inject attachment into the message so the model sees it
        // (handled below by rewriting trimmed for API)
      }

      const action = detectUiAction(trimmed, dataRef.current.projects);
      let project: Project | null | undefined =
        dataRef.current.projects.find((p) => p.id === dataRef.current.activeProjectId) || null;
      let projectId = dataRef.current.activeProjectId;

      if (action.type === 'open-project') {
        project = dataRef.current.projects.find((p) => p.id === action.projectId) || null;
        projectId = action.projectId;
        setData((d) => ({ ...d, activeProjectId: action.projectId }));
        openPanel('projects');
      } else if (action.type === 'open-panel') {
        openPanel(action.panel);
      }

      const ack = assistantAckForAction(action, project?.resumeNote || undefined);
      const s = settingsRef.current;
      const canCloud =
        !s.demoMode &&
        (s.connectionMode === 'B' || s.connectionMode === 'C') &&
        hasApiKeyRef.current;

      let reply: string;
      let thinking = '';
      let cloudStreamOk = false;

      if (canCloud) {
        const folderPaths = dataRef.current.folders
          .filter(
            (f) =>
              dataRef.current.selectedFolderIdsForNewChat.includes(f.id) ||
              project?.folderIds?.includes(f.id)
          )
          .map((f) => f.path);

        const projMedia = (dataRef.current.displayItems || []).filter(
          (i) => project && i.projectId === project.id
        );
        const reviewLines = projMedia.slice(0, 24).map((i) => {
          const v = i.vote || 'pending';
          return `- [${v}] ${i.title} (${i.kind})`;
        });
        const attNote = dataRef.current.chatAttachment
          ? `User has attached Display media for this turn: "${dataRef.current.chatAttachment.title}" (${dataRef.current.chatAttachment.kind}). Prefer editing/recreating THAT piece when they give modification instructions.`
          : null;
        const system = buildSystemPrompt({
          projectName: project?.name,
          projectInstructions: project?.instructions,
          resumeNote: project?.resumeNote,
          folders: folderPaths,
          libraryFolders: (project?.libraryFolders || []).map((f) => f.name),
          displayReview: [
            reviewLines.length
              ? reviewLines.join('\n')
              : project
                ? '(no media tagged to this project yet)'
                : null,
            attNote,
          ]
            .filter(Boolean)
            .join('\n') || null,
        });

        const conv = dataRef.current.conversations.find(
          (c) => c.id === dataRef.current.activeConversationId
        );
        const history = (conv?.messages || []).slice(-12).map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }));

        const att = dataRef.current.chatAttachment;
        let userContent =
          action.type === 'open-project'
            ? `${trimmed}\n\n(The app opened the project panel. Continue from the resume note and help with the next section.)`
            : trimmed;
        if (att) {
          userContent += `\n\n[User attached a Display ${att.kind} as the working reference: "${att.title}"]\n![Attached reference](${att.displaySrc || att.src})\nWhen they ask to recreate/modify/change it, treat THIS image as the source — do not invent an unrelated new subject.`;
        }

        // Add user message early so chat updates while streaming
        const now = new Date().toISOString();
        const userMsg: ChatMessage = {
          id: uid('msg'),
          role: 'user',
          content: trimmed,
          createdAt: now,
        };
        setData((prev) => {
          let convs = [...prev.conversations];
          let activeId = prev.activeConversationId;
          let c = convs.find((x) => x.id === activeId);
          if (!c) {
            c = {
              id: uid('conv'),
              title: trimmed.slice(0, 48) || 'New chat',
              messages: [],
              projectId: projectId ?? prev.activeProjectId,
              folderIds: [...prev.selectedFolderIdsForNewChat],
              updatedAt: now,
              saved: false,
            };
            convs = [c, ...convs];
            activeId = c.id;
          }
          convs = convs.map((x) =>
            x.id === activeId
              ? {
                  ...x,
                  messages: [...x.messages, userMsg],
                  updatedAt: now,
                  title: x.messages.length ? x.title : trimmed.slice(0, 48) || x.title,
                }
              : x
          );
          return { ...prev, conversations: convs, activeConversationId: activeId, draft: '' };
        });

        const streamingSpeech = beginStreamingSpeech();
        const result = await xaiChatCompletionStream({
          messages: [
            { role: 'system', content: system },
            ...history.filter((m) => m.role !== 'system'),
            { role: 'user', content: userContent },
          ],
          signal: abort.signal,
          onReasoning: (full) => {
            setLiveThinking(full);
            publishLive({ busy: true, thinking: full, reply: undefined });
          },
          onContent: (full) => {
            setLiveReply(full);
            publishLive({ busy: true, reply: full });
            if (streamingSpeech) pushStreamingSpeech(full);
          },
        });

        if (result.ok) {
          reply = result.content;
          thinking = result.thinking;
          cloudStreamOk = true;
          setApiOk(true);
          setLeoReady(true);
        } else {
          reply =
            (ack ? `${ack}\n\n` : '') +
            `I couldn't reach xAI cloud: ${result.error}. Check your key / network, or turn on Demo mode.`;
          setApiOk(false);
          setLeoReady(false);
        }

        // Append assistant only (user already added)
        const asstNow = new Date().toISOString();
        const asstMsg: ChatMessage = {
          id: uid('msg'),
          role: 'assistant',
          content: reply,
          createdAt: asstNow,
          thinking: thinking || undefined,
        };
        setLastAssistantText(reply);
        setData((prev) => {
          const activeId = prev.activeConversationId;
          return {
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === activeId
                ? { ...c, messages: [...c.messages, asstMsg], updatedAt: asstNow }
                : c
            ),
          };
        });
        ingestMediaFromReply(reply);
      } else {
        reply = localButlerReply(trimmed, ack, project);
        appendMessages(trimmed, reply, projectId);
        ingestMediaFromReply(reply);
      }

      // Leo sentences start from onContent; only speak the full reply when we did not stream.
      if (cloudStreamOk && speechActiveRef.current) {
        finishStreamingSpeech(reply);
      } else if (!leoQueueRef.current.heardAudio() && !voiceCancelledRef.current) {
        resetStreamingSpeech();
        speakReply(reply);
      }
      // Clear Display→chat attachment after a normal reply (image-edit path clears itself)
      setData((d) => (d.chatAttachment ? { ...d, chatAttachment: null } : d));

      // Keep thinking visible after the reply (do not wipe retained notes)
      if (thinking) setRetainedThinking(thinking);
      setLiveReply('');
      setChatBusy(false);
      streamOwnerRef.current = false;
      streamAbortRef.current = null;
      publishLive({
        busy: false,
        thinking: thinking || '',
        reply: '',
        retainedThinking: thinking || '',
      });

}

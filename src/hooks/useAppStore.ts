import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_APP_DATA,
  DEFAULT_SETTINGS,
  listTasks,
  mergeHomeTiles,
  type AppData,
  type ChatAttachment,
  type Conversation,
  type DisplayItem,
  type DisplayVote,
  type FolderItem,
  type PanelId,
  type Project,
  type ProjectLibraryFolder,
  type ScheduledTask,
  type Settings,
  type StaticPanelId,
  type WorkItem,
  projectDisplayPanelId,
} from '../lib/types';
import { LIMITS } from '../lib/limits';
import { uid } from '../lib/id';
import { textForSpeech } from '../lib/xaiChat';
import { speakText } from '../lib/speech';
import { speakWithLeo, stopLeoAudio } from '../lib/leoTts';
import { createLeoSpeakQueue } from '../lib/leoSpeakQueue';
import {
  consumeSpeechPieces,
  flushSpeechRemainder,
  prepareStreamingSpeech,
} from '../lib/speechSentences';
import { ensureSampleData } from '../lib/sampleData';
import { normalizeAppDataDisplayAndProjects } from '../lib/mediaExtract';
import { API_KEY_MASK, isApiKeyMask } from '../lib/apiKeyUi';
import {
  DATA_FILE,
  SETTINGS_FILE,
  browserFallbackLoad,
  persistAppFiles,
} from './store/persist';
import { runSendChat } from './store/sendChat';
import {
  appendChatMessages,
  ensureActiveConversationData,
  localButlerReplyText,
} from './store/conversationActions';
import {
  displayItemsFromManualUrl,
  displayItemsFromPaths,
  ingestDisplayFromReply,
  prependDisplayItems,
  removeDisplayItemFromData,
} from './store/displayActions';

export function useAppStore() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [data, setData] = useState<AppData>(DEFAULT_APP_DATA);
  const [openFloats, setOpenFloats] = useState<PanelId[]>([]);
  const [floatZ, setFloatZ] = useState<Record<string, number>>({});
  const [zCounter, setZCounter] = useState(10);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [firstRunOpen, setFirstRunOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [liveThinking, setLiveThinking] = useState('');
  const [liveReply, setLiveReply] = useState('');
  /** Kept after reply finishes so the thinking pane stays visible */
  const [retainedThinking, setRetainedThinking] = useState('');
  const streamAbortRef = useRef<AbortController | null>(null);
  const voiceCancelledRef = useRef(false);
  const speechTakenRef = useRef(0);
  const speechSpokenCharsRef = useRef(0);
  const speechActiveRef = useRef(false);
  const leoQueueHooksRef = useRef<{
    isCancelled: () => boolean;
    onFirstAudioStart: () => void;
    onQueueIdle: () => void;
    onError: (msg: string) => void;
  }>({
    isCancelled: () => false,
    onFirstAudioStart: () => {},
    onQueueIdle: () => {},
    onError: (_msg: string) => {},
  });
  const leoQueueRef = useRef(
    createLeoSpeakQueue({
      isCancelled: () => leoQueueHooksRef.current.isCancelled(),
      onFirstAudioStart: () => leoQueueHooksRef.current.onFirstAudioStart(),
      onQueueIdle: () => leoQueueHooksRef.current.onQueueIdle(),
      onError: (msg) => leoQueueHooksRef.current.onError(msg),
    })
  );
  /** True while this window owns the active cloud stream (for multi-window sync) */
  const streamOwnerRef = useRef(false);
  /** Skip one persist after load/remote apply so panel windows don't wipe new display items */
  const skipNextPersistRef = useRef(true);
  const [grokConnected, setGrokConnected] = useState(false);
  const [leoReady, setLeoReady] = useState(false);
  const [waveTaskId, setWaveTaskId] = useState<string | null>(null);
  const [pointingPanel, setPointingPanel] = useState<PanelId | null>(null);
  const [lastEngagedAt, setLastEngagedAt] = useState(() => Date.now());
  /** Bumps when user returns after long quiet — Butler welcome clip */
  const [welcomePulse, setWelcomePulse] = useState(0);
  /** User actively holding Speak / STT */
  const [userListening, setUserListening] = useState(false);
  const [lastAssistantText, setLastAssistantText] = useState('');
  const [appInfo, setAppInfo] = useState<{ version: string; dataDir: string } | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [apiOk, setApiOk] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const hasApiKeyRef = useRef(false);
  hasApiKeyRef.current = hasApiKey;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  const dataRef = useRef(data);
  settingsRef.current = settings;
  dataRef.current = data;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  leoQueueHooksRef.current = {
    isCancelled: () => voiceCancelledRef.current,
    onFirstAudioStart: () => {
      if (voiceCancelledRef.current) return;
      setSpeaking(true);
      setLeoReady(true);
    },
    onQueueIdle: () => setSpeaking(false),
    onError: (msg) => {
      setLeoReady(false);
      if (leoQueueRef.current.heardAudio() && msg) {
        showToast(`Leo failed — (${msg.slice(0, 90)})`);
      }
      speechActiveRef.current = false;
    },
  };

  /** Call on typing / send — may fire welcome after 15 min quiet */
  const noteUserActivity = useCallback(() => {
    const now = Date.now();
    setLastEngagedAt((prev) => {
      if (prev > 0 && now - prev > 15 * 60 * 1000) {
        setWelcomePulse(now);
      }
      return now;
    });
  }, []);

  const persist = useCallback(async () => {
    await persistAppFiles(settingsRef.current, dataRef.current);
  }, []);

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist();
    }, 600);
  }, [persist]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let settingsRes: { data: Settings; recovered: boolean };
      let dataRes: { data: AppData; recovered: boolean };

      let homeDir: string | undefined;
      if (window.butler) {
        const info = await window.butler.getInfo();
        homeDir = info.homeDir;
        if (!cancelled) setAppInfo({ version: info.version, dataDir: info.dataDir });
        settingsRes = await window.butler.load(SETTINGS_FILE, DEFAULT_SETTINGS);
        dataRes = await window.butler.load(DATA_FILE, DEFAULT_APP_DATA);
        const stored = await window.butler.hasKey?.();
        if (!cancelled && stored?.hasKey) {
          setHasApiKey(true);
          hasApiKeyRef.current = true;
        }
      } else {
        settingsRes = browserFallbackLoad(SETTINGS_FILE, DEFAULT_SETTINGS);
        dataRes = browserFallbackLoad(DATA_FILE, DEFAULT_APP_DATA);
        setAppInfo({ version: '0.1.0', dataDir: '(browser)' });
        if (settingsRes.data.apiKey?.trim()) {
          setHasApiKey(true);
          hasApiKeyRef.current = true;
        }
      }

      if (cancelled) return;

      const LAYOUT_VERSION = 4;
      const needsLayoutReset =
        (settingsRes.data.layoutVersion || 0) < LAYOUT_VERSION ||
        !settingsRes.data.homeTiles?.length;
      const storedHasKey = Boolean(hasApiKeyRef.current);
      const mergedSettings: Settings = {
        ...DEFAULT_SETTINGS,
        ...settingsRes.data,
        apiKey: storedHasKey ? API_KEY_MASK : '',
        layoutVersion: LAYOUT_VERSION,
        chatHeight:
          settingsRes.data.chatHeight ||
          DEFAULT_SETTINGS.chatHeight ||
          220,
        homeTiles: mergeHomeTiles(
          needsLayoutReset ? DEFAULT_SETTINGS.homeTiles : settingsRes.data.homeTiles
        ),
      };
      let mergedData: AppData = normalizeAppDataDisplayAndProjects({
        ...DEFAULT_APP_DATA,
        ...dataRes.data,
      }) as AppData;
      // Testing phase: fill empty sections with sample folders/project/tasks
      const beforeSample = mergedData;
      mergedData = ensureSampleData(mergedData, homeDir);
      mergedData = normalizeAppDataDisplayAndProjects(mergedData) as AppData;
      const addedSample = beforeSample !== mergedData;

      settingsRef.current = mergedSettings;
      dataRef.current = mergedData;
      setSettings(mergedSettings);
      setData(mergedData);
      setFirstRunOpen(!mergedSettings.firstRunDone);
      setLeoReady(storedHasKey && mergedSettings.connectionMode !== 'A');
      setApiOk(storedHasKey && mergedSettings.connectionMode !== 'A');
      if (window.butler) {
        void window.butler.setTrayMinimize(mergedSettings.minimizeToTray);
        void window.butler.setLoginItem(mergedSettings.startWithWindows);
      }
      if (settingsRes.recovered || dataRes.recovered) {
        showToast('Recovered your data after an unexpected shutdown.');
      }
      skipNextPersistRef.current = true;
      setReady(true);
      if (addedSample) void persist();
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Sync live chat (thinking/reply) across main window + float chat panel
  useEffect(() => {
    if (!window.butler?.onChatLive) return;
    return window.butler.onChatLive((state) => {
      // Owner already has local state; still apply retained so both stay aligned
      if (!streamOwnerRef.current) {
        if (typeof state.thinking === 'string') setLiveThinking(state.thinking);
        if (typeof state.reply === 'string') setLiveReply(state.reply);
        if (typeof state.busy === 'boolean') setChatBusy(state.busy);
      }
      if (typeof state.retainedThinking === 'string') {
        setRetainedThinking(state.retainedThinking);
      }
    });
  }, []);

  useEffect(() => {
    if (!window.butler?.onSecretsChanged) return;
    return window.butler.onSecretsChanged((payload) => {
      const next = Boolean(payload?.hasKey);
      setHasApiKey(next);
      hasApiKeyRef.current = next;
      setSettings((s) => {
        if (next) {
          if (s.apiKey && !isApiKeyMask(s.apiKey)) return s;
          return { ...s, apiKey: API_KEY_MASK };
        }
        return isApiKeyMask(s.apiKey) ? { ...s, apiKey: '' } : s;
      });
    });
  }, []);

  // Reload app data when another window saves (float chat ↔ main)
  useEffect(() => {
    if (!window.butler?.onStorageChanged) return;
    return window.butler.onStorageChanged((payload) => {
      if (payload?.fileName !== DATA_FILE) return;
      void (async () => {
        try {
          if (!window.butler) return;
          const res = await window.butler.load(DATA_FILE, DEFAULT_APP_DATA);
          // Don't let this reload immediately re-save and wipe newer local edits
          skipNextPersistRef.current = true;
          setData(
            normalizeAppDataDisplayAndProjects({
              ...DEFAULT_APP_DATA,
              ...res.data,
              tasks: listTasks(res.data),
              sampleTasksApplied: Boolean(
                (res.data as AppData | undefined)?.sampleTasksApplied
              ),
            }) as AppData
          );
        } catch {
          /* ignore */
        }
      })();
    });
  }, []);

  // Sync tray / login when settings change
  useEffect(() => {
    if (!ready || !window.butler) return;
    void window.butler.setTrayMinimize(settings.minimizeToTray);
  }, [settings.minimizeToTray, ready]);

  useEffect(() => {
    if (!ready || !window.butler) return;
    void window.butler.setLoginItem(settings.startWithWindows);
  }, [settings.startWithWindows, ready]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    schedulePersist();
  }, [settings, data, ready, schedulePersist]);

  useEffect(() => {
    if (!window.butler) return;
    return window.butler.onConfirmClose(() => setCloseConfirmOpen(true));
  }, []);

  useEffect(() => {
    if (!window.butler?.onPanelClosed) return;
    return window.butler.onPanelClosed((panelId) => {
      setOpenFloats((prev) => prev.filter((p) => p !== panelId));
    });
  }, []);

  const refreshGrokStatus = useCallback(async () => {
    if (!window.butler) {
      setGrokConnected(false);
      return;
    }
    const st = await window.butler.grokStatus();
    setGrokConnected(Boolean(st.connected));
  }, []);

  useEffect(() => {
    void refreshGrokStatus();
    const t = setInterval(() => void refreshGrokStatus(), 15000);
    return () => clearInterval(t);
  }, [refreshGrokStatus]);

  useEffect(() => {
    const cloud = hasApiKey && settings.connectionMode !== 'A';
    setLeoReady(cloud);
    setApiOk(cloud);
  }, [hasApiKey, settings.connectionMode]);

  // Connection banner (simple, not noisy)
  useEffect(() => {
    if (!ready) return;
    const mode = settings.connectionMode;
    if (mode === 'A' && !grokConnected) {
      setBanner('Grok Build not detected. Click Start Grok, or switch to Mode B/C in Settings.');
    } else if ((mode === 'B' || mode === 'C') && !hasApiKey && !settings.demoMode) {
      setBanner('Cloud mode needs an xAI API key in Settings ⚙');
    } else if (mode === 'C' && !grokConnected) {
      setBanner('Mode C: API ready for chat; Grok Build offline for PC work tasks.');
    } else {
      setBanner(null);
    }
  }, [ready, settings.connectionMode, hasApiKey, settings.demoMode, grokConnected]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    if (!Object.prototype.hasOwnProperty.call(patch, 'apiKey')) return;
    const v = String(patch.apiKey || '').trim();
    if (isApiKeyMask(v)) return;
    if (!window.butler?.setKey) {
      setHasApiKey(Boolean(v));
      hasApiKeyRef.current = Boolean(v);
      return;
    }
    if (!v) {
      setHasApiKey(false);
      hasApiKeyRef.current = false;
      void window.butler.clearKey?.();
      return;
    }
    setHasApiKey(true);
    hasApiKeyRef.current = true;
    void window.butler.setKey(v).then((r) => {
      if (!r?.ok) {
        setHasApiKey(false);
        hasApiKeyRef.current = false;
        showToast(r?.error || 'Could not save API key.');
      }
    });
  }, [showToast]);

  const updateData = useCallback((patch: Partial<AppData> | ((d: AppData) => AppData)) => {
    setData((d) => (typeof patch === 'function' ? patch(d) : { ...d, ...patch }));
  }, []);

  const openPanel = useCallback((id: PanelId) => {
    // Trigger Butler pointing animation toward the desk panels
    setPointingPanel(id);
    window.setTimeout(() => setPointingPanel(null), 1700);

    const openInApp = () => {
      setOpenFloats((prev) => {
        const already = prev.includes(id);
        setSettings((s) => {
          if (s.floatLayouts[id]) return s;
          const offset = (already ? prev.indexOf(id) : prev.length) * 28;
          return {
            ...s,
            floatLayouts: {
              ...s.floatLayouts,
              [id]: { x: 36 + offset, y: 36 + offset, w: 460, h: 380 },
            },
          };
        });
        return already ? prev : [...prev, id];
      });
      setZCounter((z) => {
        const next = z + 1;
        setFloatZ((fz) => ({ ...fz, [id]: next }));
        return next;
      });
    };

    // Prefer real OS windows so panels can move outside the main app frame
    if (window.butler?.openPanelWindow) {
      void window.butler
        .openPanelWindow(id)
        .then((r) => {
          if (!r || r.ok === false) openInApp();
        })
        .catch(() => openInApp());
      return;
    }

    openInApp();
  }, []);

  const closePanel = useCallback((id: PanelId) => {
    if (window.butler?.closePanelWindow) {
      void window.butler.closePanelWindow(id);
    }
    setOpenFloats((prev) => prev.filter((p) => p !== id));
  }, []);

  const focusPanel = useCallback((id: PanelId) => {
    setZCounter((z) => {
      const next = z + 1;
      setFloatZ((fz) => ({ ...fz, [id]: next }));
      return next;
    });
  }, []);

  const moveHomeTile = useCallback((id: StaticPanelId, x: number, y: number) => {
    setSettings((s) => ({
      ...s,
      homeTiles: s.homeTiles.map((t) => (t.id === id ? { ...t, x, y } : t)),
    }));
  }, []);

  /** Open General Display or a project's private Display window. */
  const openDisplayFor = useCallback(
    (projectId: string | null) => {
      if (projectId) openPanel(projectDisplayPanelId(projectId));
      else openPanel('display');
    },
    [openPanel]
  );

  const saveFloatLayout = useCallback(
    (id: PanelId, layout: { x: number; y: number; w: number; h: number }) => {
      setSettings((s) => ({
        ...s,
        floatLayouts: { ...s.floatLayouts, [id]: layout },
      }));
    },
    []
  );

  const ensureActiveConversation = useCallback((): Conversation => {
    const { next, conversation } = ensureActiveConversationData(dataRef.current);
    if (next !== dataRef.current) setData(next);
    return conversation;
  }, []);

  const appendMessages = useCallback(
    (
      userText: string,
      assistantText: string,
      projectId?: string | null,
      thinking?: string
    ) => {
      setLastAssistantText(assistantText);
      setData((prev) => appendChatMessages(prev, userText, assistantText, projectId, thinking));
    },
    []
  );

  const localButlerReply = useCallback(
    (userText: string, actionAck: string | null, project?: Project | null) =>
      localButlerReplyText(userText, actionAck, settingsRef.current, grokConnected, project),
    [grokConnected]
  );

  const publishLive = useCallback(
    (state: {
      busy?: boolean;
      thinking?: string;
      reply?: string;
      retainedThinking?: string;
    }) => {
      if (window.butler?.publishChatLive) {
        void window.butler.publishChatLive(state);
      }
    },
    []
  );

  const resetStreamingSpeech = useCallback(() => {
    speechTakenRef.current = 0;
    speechSpokenCharsRef.current = 0;
    speechActiveRef.current = false;
    leoQueueRef.current.reset();
  }, []);

  const beginStreamingSpeech = useCallback(() => {
    const s = settingsRef.current;
    const canLeo =
      hasApiKeyRef.current &&
      (s.connectionMode === 'B' || s.connectionMode === 'C') &&
      s.butlerVoiceOn &&
      !s.muteSounds;
    resetStreamingSpeech();
    voiceCancelledRef.current = false;
    if (!canLeo) return false;
    stopLeoAudio();
    speechActiveRef.current = true;
    return true;
  }, [resetStreamingSpeech]);

  const pushStreamingSpeech = useCallback((full: string) => {
    if (!speechActiveRef.current || voiceCancelledRef.current) return;
    const prepared = prepareStreamingSpeech(full);
    const next = consumeSpeechPieces(
      prepared,
      speechTakenRef.current,
      speechSpokenCharsRef.current
    );
    speechTakenRef.current = next.nextTaken;
    speechSpokenCharsRef.current = next.nextSpokenChars;
    for (const piece of next.pieces) {
      leoQueueRef.current.enqueue(piece);
    }
  }, []);

  const finishStreamingSpeech = useCallback((full: string) => {
    if (!speechActiveRef.current) return false;
    if (voiceCancelledRef.current) {
      resetStreamingSpeech();
      return true;
    }
    const prepared = prepareStreamingSpeech(full);
    const tail = flushSpeechRemainder(
      prepared,
      speechTakenRef.current,
      speechSpokenCharsRef.current
    );
    if (tail) leoQueueRef.current.enqueue(tail);
    const used = leoQueueRef.current.wasUsed() || Boolean(tail);
    leoQueueRef.current.finish();
    speechActiveRef.current = false;
    return used;
  }, [resetStreamingSpeech]);

  const stopVoice = useCallback(() => {
    voiceCancelledRef.current = true;
    speechActiveRef.current = false;
    leoQueueRef.current.reset();
    stopLeoAudio();
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    setSpeaking(false);
    showToast('Voice stopped.');
  }, [showToast]);

  const speakReply = useCallback((reply: string) => {
    voiceCancelledRef.current = false;
    // Do NOT set speaking yet — wait until audio actually starts (sync mouth video + VU)
    setSpeaking(false);
    const s = settingsRef.current;
    if (!s.butlerVoiceOn || s.muteSounds) {
      return;
    }

    // Don't read huge code dumps aloud — speak a short summary-friendly version
    const spoken = textForSpeech(reply);
    if (!spoken) {
      return;
    }

    const canLeo =
      hasApiKeyRef.current && (s.connectionMode === 'B' || s.connectionMode === 'C');

    // Stream TTS in main as bytes arrive; mouth/VU still wait for real LEO_PLAY_START

    const markStart = () => {
      if (voiceCancelledRef.current) return;
      setSpeaking(true);
      setLeoReady(true);
    };
    const markEnd = () => setSpeaking(false);

    const fallbackSystem = (why?: string) => {
      if (voiceCancelledRef.current) {
        markEnd();
        return;
      }
      if (why) {
        showToast(`Leo failed — using Windows voice. (${why.slice(0, 90)})`);
        setLeoReady(false);
      }
      const ok = speakText(spoken, {
        onStart: () => {
          if (voiceCancelledRef.current) {
            try {
              window.speechSynthesis.cancel();
            } catch {
              /* ignore */
            }
            markEnd();
            return;
          }
          markStart();
        },
        onEnd: markEnd,
      });
      if (!ok) markEnd();
    };

    if (canLeo) {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
      }
      void speakWithLeo(undefined, spoken, {
        onStart: markStart,
        onEnd: markEnd,
        onError: (msg) => {
          if (msg) setLeoReady(false);
        },
      }).then((r) => {
        if (voiceCancelledRef.current || (r.ok && r.cancelled)) {
          markEnd();
          return;
        }
        if (!r.ok) {
          fallbackSystem(r.error);
        } else {
          setLeoReady(true);
          markEnd();
        }
      });
      return;
    }

    if (voiceCancelledRef.current) {
      markEnd();
      return;
    }
    showToast('Cloud mode/key needed for Leo — using Windows voice.');
    const ok = speakText(spoken, {
      onStart: markStart,
      onEnd: markEnd,
    });
    if (!ok) markEnd();
  }, [showToast]);

  const ingestMediaFromReply = useCallback(
    (text: string) => {
      let projectId: string | null = null;
      let items: DisplayItem[] = [];
      setData((d) => {
        const result = ingestDisplayFromReply(d, text);
        projectId = result.projectId;
        items = result.added;
        return result.next;
      });
      if (!items.length) return;
      if (projectId) openPanel(projectDisplayPanelId(projectId));
      else openPanel('display');
      showToast(
        items.length === 1
          ? projectId
            ? `Opened this project’s Display with ${items[0].kind}.`
            : `Opened General Display with ${items[0].kind}.`
          : projectId
            ? `Opened this project’s Display (${items.length} items).`
            : `Opened General Display (${items.length} items).`
      );
    },
    [openPanel, showToast]
  );

  const openGrokTerminal = useCallback(
    async (
      kind:
        | 'update'
        | 'update-alpha'
        | 'update-check'
        | 'marketplace'
        | 'grok'
        | 'plugin-install'
        | 'plugin-update',
      extraArgs?: string
    ) => {
      if (!window.butler?.grokOpenTerminal) {
        if (kind === 'update' || kind === 'update-alpha' || kind === 'update-check') {
          await window.butler?.grokUpdate?.({
            alpha: kind === 'update-alpha',
            checkOnly: kind === 'update-check',
          });
          return;
        }
        await window.butler?.grokStart?.();
        return;
      }
      const r = await window.butler.grokOpenTerminal({ kind, extraArgs });
      const cmd =
        (r as { command?: string }).command ||
        (kind === 'update-alpha'
          ? 'grok update --alpha'
          : kind === 'update'
            ? 'grok update --stable'
            : kind === 'marketplace'
              ? 'grok'
              : 'grok');
      showToast(`Copied: ${cmd}  →  open NEW TAB, paste, Enter`);
    },
    [showToast]
  );

  const startNewConversation = useCallback(() => {
    const now = new Date().toISOString();
    const projectId = dataRef.current.activeProjectId;
    const conv: Conversation = {
      id: uid('conv'),
      title: 'New chat',
      messages: [],
      projectId,
      folderIds: [...dataRef.current.selectedFolderIdsForNewChat],
      updatedAt: now,
      saved: false,
    };
    const next: AppData = {
      ...dataRef.current,
      conversations: [conv, ...dataRef.current.conversations].slice(0, 40),
      activeConversationId: conv.id,
      draft: '',
      projects: projectId
        ? dataRef.current.projects.map((p) =>
            p.id === projectId && !p.conversationIds.includes(conv.id)
              ? {
                  ...p,
                  conversationIds: [conv.id, ...p.conversationIds].slice(0, 40),
                  updatedAt: now,
                }
              : p
          )
        : dataRef.current.projects,
    };
    dataRef.current = next;
    setData(next);
    showToast(
      projectId
        ? 'New chat in this project — you’re talking inside the project.'
        : 'Started a new conversation.'
    );
    void persist();
  }, [persist, showToast]);

  /**
   * Enter a project workspace: set active project, resume or start its chat,
   * apply project folders, and open floating chat so it sits next to the panel.
   */
  const openProjectChat = useCallback(
    (projectId: string, mode: 'continue' | 'new' = 'continue') => {
      const project = dataRef.current.projects.find((p) => p.id === projectId);
      if (!project) {
        showToast('Project not found.');
        return;
      }
      const now = new Date().toISOString();
      let convId: string | null = null;

      if (mode === 'continue') {
        const byLink = dataRef.current.conversations
          .filter(
            (c) =>
              c.projectId === projectId || project.conversationIds.includes(c.id)
          )
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (byLink[0]) convId = byLink[0].id;
      }

      if (!convId || mode === 'new') {
        const conv: Conversation = {
          id: uid('conv'),
          title: `${project.name} chat`,
          messages: [],
          projectId,
          folderIds: [...(project.folderIds || [])],
          updatedAt: now,
          saved: false,
        };
        convId = conv.id;
        const next: AppData = {
          ...dataRef.current,
          activeProjectId: projectId,
          activeConversationId: convId,
          draft: '',
          selectedFolderIdsForNewChat: [...(project.folderIds || [])],
          conversations: [conv, ...dataRef.current.conversations].slice(0, 40),
          projects: dataRef.current.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  conversationIds: [conv.id, ...p.conversationIds.filter((id) => id !== conv.id)].slice(
                    0,
                    40
                  ),
                  updatedAt: now,
                }
              : p
          ),
        };
        dataRef.current = next;
        setData(next);
        showToast(`Chat open for “${project.name}” — pick up where you left off.`);
      } else {
        const next: AppData = {
          ...dataRef.current,
          activeProjectId: projectId,
          activeConversationId: convId,
          selectedFolderIdsForNewChat: [
            ...new Set([
              ...(project.folderIds || []),
              ...(dataRef.current.conversations.find((c) => c.id === convId)?.folderIds || []),
            ]),
          ],
          projects: dataRef.current.projects.map((p) =>
            p.id === projectId && !p.conversationIds.includes(convId!)
              ? {
                  ...p,
                  conversationIds: [convId!, ...p.conversationIds].slice(0, 40),
                  updatedAt: now,
                }
              : p
          ),
        };
        dataRef.current = next;
        setData(next);
        showToast(`Continuing chat in “${project.name}”.`);
      }

      // Persist first so a newly opened chat window loads this conversation.
      void persist().then(() => openPanel('chat'));
    },
    [openPanel, persist, showToast]
  );

  const sendChat = useCallback(
    async (text: string) => {
      await runSendChat(
        {
          dataRef,
          setData,
          appendMessages,
          startNewConversation,
          setSettingsOpen,
          openPanel,
          openGrokTerminal,
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
          settingsRef,
          hasApiKeyRef,
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
        },
        text
      );
    },
    [
      appendMessages,
      beginStreamingSpeech,
      chatBusy,
      ensureActiveConversation,
      finishStreamingSpeech,
      ingestMediaFromReply,
      localButlerReply,
      noteUserActivity,
      openGrokTerminal,
      openPanel,
      publishLive,
      pushStreamingSpeech,
      resetStreamingSpeech,
      speakReply,
      startNewConversation,
    ]
  );

  const replayLast = useCallback(() => {
    if (!lastAssistantText) {
      showToast('No Butler reply to play yet.');
      return;
    }
    voiceCancelledRef.current = false;
    resetStreamingSpeech();
    stopLeoAudio();
    speakReply(lastAssistantText);
    showToast('Replaying last Butler reply…');
  }, [lastAssistantText, resetStreamingSpeech, speakReply, showToast]);

  const addDisplayFromUrl = useCallback(
    (url: string) => {
      const items = displayItemsFromManualUrl(url);
      setData((d) => prependDisplayItems(d, items));
      const pid = dataRef.current.activeProjectId;
      if (pid) openPanel(projectDisplayPanelId(pid));
      else openPanel('display');
      showToast(pid ? 'Added to this project’s Display.' : 'Added to General Display.');
    },
    [openPanel, showToast]
  );

  const setActiveDisplay = useCallback((id: string) => {
    setData((d) => ({ ...d, activeDisplayId: id }));
  }, []);

  const removeDisplayItem = useCallback((id: string) => {
    setData((d) => removeDisplayItemFromData(d, id));
  }, []);

  const patchDisplayItem = useCallback(
    (id: string, patch: Partial<DisplayItem>) => {
      setData((d) => ({
        ...d,
        displayItems: (d.displayItems || []).map((i) =>
          i.id === id ? { ...i, ...patch } : i
        ),
      }));
    },
    []
  );

  const addDisplayFromPaths = useCallback(
    (paths: string[]) => {
      const items = displayItemsFromPaths(paths);
      if (!items.length) {
        showToast('No usable files in that drop.');
        return;
      }
      setData((d) => prependDisplayItems(d, items));
      const pid = dataRef.current.activeProjectId;
      if (pid) openPanel(projectDisplayPanelId(pid));
      else openPanel('display');
      showToast(
        pid
          ? `Added ${items.length} file(s) to this project’s Display.`
          : `Added ${items.length} file(s) to General Display.`
      );
    },
    [openPanel, showToast]
  );

  const addFolder = useCallback(async () => {
    if (dataRef.current.folders.length >= LIMITS.folders) {
      showToast(`Maximum ${LIMITS.folders} folders.`);
      return;
    }
    let path: string | null = null;
    if (window.butler) path = await window.butler.pickFolder();
    else path = prompt('Folder path') || null;
    if (!path) return;
    const item: FolderItem = {
      id: uid('folder'),
      path,
      label: path.split(/[/\\]/).filter(Boolean).pop() || path,
    };
    setData((d) => ({
      ...d,
      folders: [...d.folders, item].slice(0, LIMITS.folders),
    }));
  }, [showToast]);

  const removeFolder = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      folders: d.folders.filter((f) => f.id !== id),
      selectedFolderIdsForNewChat: d.selectedFolderIdsForNewChat.filter((x) => x !== id),
    }));
  }, []);

  const addProject = useCallback(
    (name: string) => {
      if (dataRef.current.projects.length >= LIMITS.projects) {
        showToast(`Maximum ${LIMITS.projects} projects.`);
        return;
      }
      const p: Project = {
        id: uid('proj'),
        name: name.trim() || 'Untitled project',
        instructions: '',
        conversationIds: [],
        folderIds: [],
        libraryFolders: [],
        resumeNote: 'Start',
        updatedAt: new Date().toISOString(),
      };
      setData((d) => ({ ...d, projects: [...d.projects, p], activeProjectId: p.id }));
      showToast(`Project “${p.name}” created and set active.`);
    },
    [showToast]
  );

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p
      ),
    }));
  }, []);

  const removeProject = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.filter((p) => p.id !== id),
      activeProjectId: d.activeProjectId === id ? null : d.activeProjectId,
    }));
  }, []);

  const setActiveProject = useCallback((id: string | null) => {
    setData((d) => ({ ...d, activeProjectId: id }));
  }, []);

  /** Create an in-project library folder (user or Butler can call). */
  const addProjectLibraryFolder = useCallback(
    (projectId: string, folderName: string) => {
      const name = folderName.trim() || 'New folder';
      const folder: ProjectLibraryFolder = {
        id: uid('plib'),
        name,
        parentId: null,
      };
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) => {
          if (p.id !== projectId) return p;
          const libs = p.libraryFolders || [];
          if (libs.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
            return p;
          }
          return {
            ...p,
            libraryFolders: [...libs, folder],
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
      showToast(`Folder “${name}” added to project.`);
      return folder.id;
    },
    [showToast]
  );

  const removeProjectLibraryFolder = useCallback((projectId: string, folderId: string) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.id === projectId
          ? {
              ...p,
              libraryFolders: (p.libraryFolders || []).filter((f) => f.id !== folderId),
              updatedAt: new Date().toISOString(),
            }
          : p
      ),
      displayItems: (d.displayItems || []).map((i) =>
        i.projectId === projectId && i.libraryFolderId === folderId
          ? { ...i, libraryFolderId: null }
          : i
      ),
    }));
  }, []);

  const setDisplayVote = useCallback((id: string, vote: DisplayVote) => {
    setData((d) => ({
      ...d,
      displayItems: (d.displayItems || []).map((i) =>
        i.id === id ? { ...i, vote } : i
      ),
    }));
  }, []);

  const assignDisplayToProject = useCallback(
    (itemId: string, projectId: string | null, libraryFolderId?: string | null) => {
      setData((d) => ({
        ...d,
        displayItems: (d.displayItems || []).map((i) =>
          i.id === itemId
            ? {
                ...i,
                projectId,
                libraryFolderId:
                  libraryFolderId === undefined ? i.libraryFolderId : libraryFolderId,
              }
            : i
        ),
      }));
    },
    []
  );

  const saveConversation = useCallback(
    (id: string) => {
      const target = dataRef.current.conversations.find((c) => c.id === id);
      if (!target) return;
      if (target.projectId) {
        const savedInProject = dataRef.current.conversations.filter(
          (c) => c.projectId === target.projectId && c.saved
        ).length;
        if (!target.saved && savedInProject >= LIMITS.projectSavedConversations) {
          showToast(
            `Maximum ${LIMITS.projectSavedConversations} saved chats in this project. Unsave one first.`
          );
          return;
        }
      } else {
        const savedCount = dataRef.current.conversations.filter((c) => c.saved && !c.projectId)
          .length;
        if (!target.saved && savedCount >= LIMITS.savedConversations) {
          showToast(`Maximum ${LIMITS.savedConversations} saved general conversations.`);
          return;
        }
      }
      setData((d) => ({
        ...d,
        conversations: d.conversations.map((c) => (c.id === id ? { ...c, saved: true } : c)),
      }));
      showToast(
        target.projectId ? 'Saved in this project’s chat list.' : 'Conversation saved.'
      );
    },
    [showToast]
  );

  /** Leave project context and return to a general (non-project) chat. */
  const leaveProjectContext = useCallback(() => {
    const general = dataRef.current.conversations
      .filter((c) => !c.projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (general[0]) {
      setData((d) => ({
        ...d,
        activeProjectId: null,
        activeConversationId: general[0].id,
      }));
      showToast('Back to general chat.');
      return;
    }
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: uid('conv'),
      title: 'General chat',
      messages: [],
      projectId: null,
      folderIds: [],
      updatedAt: now,
      saved: false,
    };
    setData((d) => ({
      ...d,
      activeProjectId: null,
      activeConversationId: conv.id,
      draft: '',
      conversations: [conv, ...d.conversations].slice(0, 40),
    }));
    showToast('Back to general chat.');
  }, [showToast]);

  /**
   * Turn the current main chat into a new project (keeps full history).
   */
  const convertChatToProject = useCallback(
    (name?: string) => {
      const convId = dataRef.current.activeConversationId;
      const conv = dataRef.current.conversations.find((c) => c.id === convId);
      if (!conv || !conv.messages.length) {
        showToast('Need some messages in chat first, then save as a project.');
        return;
      }
      if (conv.projectId) {
        showToast('This chat is already in a project.');
        return;
      }
      if (dataRef.current.projects.length >= LIMITS.projects) {
        showToast(`Maximum ${LIMITS.projects} projects.`);
        return;
      }
      const firstUser = conv.messages.find((m) => m.role === 'user')?.content || '';
      const projName =
        (name || '').trim() ||
        conv.title?.replace(/^New chat$/i, '').trim() ||
        firstUser.slice(0, 48).trim() ||
        'Untitled project';
      const now = new Date().toISOString();
      const p: Project = {
        id: uid('proj'),
        name: projName,
        instructions: `Created from chat on ${new Date().toLocaleString()}. Continue this work in this project.`,
        conversationIds: [conv.id],
        folderIds: [...(conv.folderIds || [])],
        libraryFolders: [],
        resumeNote: firstUser.slice(0, 120) || 'Started from main chat',
        updatedAt: now,
      };
      setData((d) => ({
        ...d,
        projects: [...d.projects, p],
        activeProjectId: p.id,
        conversations: d.conversations.map((c) =>
          c.id === conv.id
            ? {
                ...c,
                projectId: p.id,
                title: c.title === 'New chat' || c.title === 'General chat' ? projName : c.title,
                saved: true,
                updatedAt: now,
              }
            : c
        ),
      }));
      showToast(`Project “${projName}” created from this chat — you’re inside it now.`);
      openPanel('projects');
    },
    [openPanel, showToast]
  );

  /** Open a dedicated Grok Build terminal for one project. */
  const openGrokForProject = useCallback(
    async (projectId: string) => {
      const project = dataRef.current.projects.find((p) => p.id === projectId);
      if (!project) {
        showToast('Project not found.');
        return;
      }
      if (!window.butler?.grokOpenForProject) {
        showToast('Use the desktop app (not a browser tab) to open Grok Build.');
        return;
      }
      showToast(`Opening Grok Build for “${project.name}”… look for a new black console window.`);
      const r = await window.butler.grokOpenForProject({
        id: project.id,
        name: project.name,
        instructions: project.instructions,
        resumeNote: project.resumeNote,
      });
      if (r.ok) {
        showToast(
          `Grok window launched for “${project.name}”. If you don’t see it: check the taskbar, or paste the command already copied to your clipboard into a new terminal tab.`
        );
      } else {
        showToast(r.error || 'Could not open Grok for project.');
      }
    },
    [showToast]
  );

  const bringDisplayToChat = useCallback(
    (itemId: string) => {
      const item = dataRef.current.displayItems.find((i) => i.id === itemId);
      if (!item) {
        showToast('Media not found.');
        return;
      }
      if (item.kind === 'link') {
        showToast('That is a web link — open it externally, or use an image/video.');
        return;
      }
      const att: ChatAttachment = {
        displayItemId: item.id,
        kind: item.kind,
        src: item.src,
        displaySrc: item.displaySrc,
        title: item.title,
        projectId: item.projectId,
      };
      setData((d) => ({
        ...d,
        chatAttachment: att,
        activeProjectId: item.projectId || d.activeProjectId,
      }));
      showToast(
        `Attached “${item.title.slice(0, 40)}” to chat. Say how to change it, then Send.`
      );
      openPanel('chat');
    },
    [openPanel, showToast]
  );

  const clearChatAttachment = useCallback(() => {
    setData((d) => ({ ...d, chatAttachment: null }));
  }, []);

  const selectConversation = useCallback((id: string) => {
    const c = dataRef.current.conversations.find((x) => x.id === id);
    if (!c) return;
    setData((d) => ({
      ...d,
      activeConversationId: id,
      activeProjectId: c.projectId || null,
      selectedFolderIdsForNewChat: [...(c.folderIds || [])],
      draft: '',
    }));
  }, []);

  const deleteConversation = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      conversations: d.conversations.filter((c) => c.id !== id),
      activeConversationId: d.activeConversationId === id ? null : d.activeConversationId,
    }));
  }, []);

  const resumeConversation = useCallback((id: string) => {
    setData((d) => ({ ...d, activeConversationId: id }));
  }, []);

  const addTask = useCallback(
    (task: Omit<ScheduledTask, 'id'>) => {
      if (listTasks(dataRef.current).length >= 10) {
        showToast('Maximum 10 tasks.');
        return;
      }
      const t: ScheduledTask = { ...task, id: uid('task') };
      setData((d) => ({ ...d, tasks: [...listTasks(d), t] }));
    },
    [showToast]
  );

  const updateTask = useCallback((id: string, patch: Partial<ScheduledTask>) => {
    setData((d) => ({
      ...d,
      tasks: listTasks(d).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }, []);

  const removeTask = useCallback((id: string) => {
    setData((d) => ({ ...d, tasks: listTasks(d).filter((t) => t.id !== id) }));
  }, []);

  // Task scheduler tick
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const now = Date.now();
      const tasks = listTasks(dataRef.current);
      for (const t of tasks) {
        if (!t.enabled) continue;
        const runAt = new Date(t.runAt).getTime();
        if (Number.isNaN(runAt) || runAt > now) continue;
        if (t.lastRunAt && new Date(t.lastRunAt).getTime() >= runAt) continue;

        // Fire
        setData((d) => ({
          ...d,
          tasks: listTasks(d).map((x) =>
            x.id === t.id
              ? {
                  ...x,
                  lastRunAt: new Date().toISOString(),
                  runAt:
                    t.repeat === 'daily'
                      ? new Date(runAt + 86400000).toISOString()
                      : t.repeat === 'weekly'
                        ? new Date(runAt + 7 * 86400000).toISOString()
                        : x.runAt,
                  enabled: t.repeat === 'once' ? false : x.enabled,
                }
              : x
          ),
        }));

        if (t.type === 'remind') {
          setWaveTaskId(t.id);
          if (settingsRef.current.notifications && window.butler) {
            void window.butler.notify({
              title: 'Butler Grok reminder',
              body: t.title,
            });
          }
          showToast(`Reminder: ${t.title}`);
          setTimeout(() => setWaveTaskId(null), 8000);
        } else {
          const workId = uid('work');
          const work: WorkItem = {
            id: workId,
            title: t.title,
            status: 'running',
            source: 'task',
            startedAt: new Date().toISOString(),
            detail: t.prompt || 'Work task',
          };
          setData((d) => ({ ...d, workItems: [work, ...d.workItems].slice(0, 30) }));
          openPanel('currentlyOpen');
          void (async () => {
            if (window.butler?.grokRunWork) {
              const butlerPreamble =
                'You are working through Butler Grok, an unofficial Windows desktop GUI for Grok Build. ' +
                'The user is often not a power user. Available UI: chat, Folders, Projects, Tasks, Currently Open, ' +
                'Marketplace (plugins/MCP), Display (preview shell). Data lives under C:\\Grok Build\\Butler Grok\\Data\\.\n\n';
              const r = await window.butler.grokRunWork({
                jobId: workId,
                title: t.title,
                prompt: butlerPreamble + (t.prompt || t.title),
              });
              setData((d) => ({
                ...d,
                workItems: d.workItems.map((w) =>
                  w.id === workId
                    ? {
                        ...w,
                        status: r.ok ? 'done' : 'failed',
                        finishedAt: new Date().toISOString(),
                        detail: r.ok
                          ? `Opened Grok Build work session.${r.grokOnPath ? '' : ' (grok not on PATH — see PowerShell notes.)'} Job saved under Data/work-jobs.`
                          : 'Could not start work session.',
                      }
                    : w
                ),
              }));
              if (settingsRef.current.notifications && window.butler) {
                void window.butler.notify({
                  title: 'Butler Grok work task',
                  body: r.ok ? `Started: ${t.title}` : `Failed: ${t.title}`,
                });
              }
            } else {
              setData((d) => ({
                ...d,
                workItems: d.workItems.map((w) =>
                  w.id === workId
                    ? {
                        ...w,
                        status: 'failed',
                        finishedAt: new Date().toISOString(),
                        detail: 'Desktop bridge unavailable (run the Electron app).',
                      }
                    : w
                ),
              }));
            }
          })();
        }
      }
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [ready, openPanel, showToast]);

  const completeFirstRun = useCallback(() => {
    updateSettings({ firstRunDone: true });
    setData((d) => {
      if (d.projects.some((p) => p.name.toLowerCase() === 'her pride')) return d;
      if (d.projects.length > 0) return d;
      const sample: Project = {
        id: uid('proj'),
        name: 'Her Pride',
        instructions:
          'Fantasy book project. Work chapter by chapter. Keep tone consistent. Resume from the last section note.',
        conversationIds: [],
        folderIds: [],
        libraryFolders: [
          { id: uid('plib'), name: 'Covers', parentId: null },
          { id: uid('plib'), name: 'Characters', parentId: null },
        ],
        resumeNote: 'Prologue complete — begin Chapter 1',
        updatedAt: new Date().toISOString(),
      };
      return { ...d, projects: [sample] };
    });
    setFirstRunOpen(false);
    showToast('Tip: say “resume Her Pride” in chat to open the project panel.');
  }, [updateSettings, showToast]);

  const confirmQuit = useCallback(async () => {
    await persist();
    if (window.butler) await window.butler.quit();
    else window.close();
  }, [persist]);

  const activeConversation =
    data.conversations.find((c) => c.id === data.activeConversationId) || null;
  const activeProject =
    data.projects.find((p) => p.id === data.activeProjectId) || null;

  const recentConversations = [...data.conversations]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LIMITS.recentConversations);
  const savedConversations = data.conversations
    .filter((c) => c.saved)
    .slice(0, LIMITS.savedConversations);

  return {
    ready,
    settings,
    data,
    updateSettings,
    updateData,
    openFloats,
    openPanel,
    openDisplayFor,
    closePanel,
    focusPanel,
    floatZ,
    moveHomeTile,
    saveFloatLayout,
    toast,
    showToast,
    settingsOpen,
    setSettingsOpen,
    closeConfirmOpen,
    setCloseConfirmOpen,
    firstRunOpen,
    setFirstRunOpen,
    completeFirstRun,
    confirmQuit,
    speaking,
    stopVoice,
    liveThinking,
    liveReply,
    retainedThinking,
    pointingPanel,
    lastEngagedAt,
    welcomePulse,
    userListening,
    setUserListening,
    noteUserActivity,
    chatBusy,
    grokConnected,
    leoReady,
    refreshGrokStatus,
    waveTaskId,
    lastAssistantText,
    replayLast,
    sendChat,
    activeConversation,
    activeProject,
    recentConversations,
    savedConversations,
    addFolder,
    removeFolder,
    addProject,
    updateProject,
    removeProject,
    setActiveProject,
    addProjectLibraryFolder,
    removeProjectLibraryFolder,
    setDisplayVote,
    assignDisplayToProject,
    saveConversation,
    deleteConversation,
    resumeConversation,
    startNewConversation,
    openProjectChat,
    leaveProjectContext,
    convertChatToProject,
    openGrokForProject,
    selectConversation,
    bringDisplayToChat,
    clearChatAttachment,
    addTask,
    updateTask,
    removeTask,
    appInfo,
    persist,
    apiOk,
    hasApiKey,
    banner,
    setBanner,
    addDisplayFromUrl,
    setActiveDisplay,
    removeDisplayItem,
    patchDisplayItem,
    addDisplayFromPaths,
    ingestMediaFromReply,
    openGrokTerminal,
  };
}

export type AppStore = ReturnType<typeof useAppStore>;

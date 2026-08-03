export type ChatRole = 'system' | 'user' | 'assistant';

export type ApiMessage = {
  role: ChatRole;
  content: string;
};

const XAI_BASE = 'https://api.x.ai/v1';
/** Prefer a current flagship; fall back list if model missing */
const MODEL_CANDIDATES = ['grok-4.5', 'grok-4', 'grok-3', 'grok-2-latest'];

export async function testXaiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'No API key provided.' };
  try {
    const res = await fetch(`${XAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    if (res.ok) return { ok: true, message: 'Connected to xAI — API key works.' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Key rejected (unauthorized). Check the key in your xAI console.' };
    }
    const text = await res.text();
    return { ok: false, message: `xAI responded ${res.status}: ${text.slice(0, 120)}` };
  } catch (err) {
    return { ok: false, message: `Network error: ${String(err)}` };
  }
}

export async function xaiChatCompletion(opts: {
  apiKey: string;
  messages: ApiMessage[];
  model?: string;
}): Promise<{ ok: true; content: string; model: string } | { ok: false; error: string }> {
  const key = opts.apiKey.trim();
  if (!key) return { ok: false, error: 'No API key. Add one in Settings (Mode B or C).' };

  const models = opts.model ? [opts.model, ...MODEL_CANDIDATES] : MODEL_CANDIDATES;
  let lastError = 'Unknown error';

  for (const model of models) {
    try {
      const res = await fetch(`${XAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} (${model}): ${body.slice(0, 200)}`;
        if (res.status === 404 || /model/i.test(body)) continue;
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: 'API key unauthorized. Check Settings.' };
        }
        continue;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string; reasoning_content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        lastError = 'Empty response from model.';
        continue;
      }
      return { ok: true, content, model };
    } catch (err) {
      lastError = String(err);
    }
  }

  return { ok: false, error: lastError };
}

export type StreamHandlers = {
  onReasoning?: (full: string, delta: string) => void;
  onContent?: (full: string, delta: string) => void;
  signal?: AbortSignal;
};

/**
 * Stream chat completions. Surfaces reasoning_content (thinking) separately from final content.
 */
export async function xaiChatCompletionStream(
  opts: {
    apiKey: string;
    messages: ApiMessage[];
    model?: string;
  } & StreamHandlers
): Promise<
  | { ok: true; content: string; thinking: string; model: string }
  | { ok: false; error: string }
> {
  const key = opts.apiKey.trim();
  if (!key) return { ok: false, error: 'No API key. Add one in Settings (Mode B or C).' };

  const models = opts.model ? [opts.model, ...MODEL_CANDIDATES] : MODEL_CANDIDATES;
  let lastError = 'Unknown error';

  for (const model of models) {
    try {
      const res = await fetch(`${XAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages: opts.messages,
          temperature: 0.7,
          stream: true,
        }),
        signal: opts.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} (${model}): ${body.slice(0, 200)}`;
        if (res.status === 404 || /model/i.test(body)) continue;
        if (res.status === 401 || res.status === 403) {
          return { ok: false, error: 'API key unauthorized. Check Settings.' };
        }
        continue;
      }

      if (!res.body) {
        lastError = 'No stream body from API.';
        continue;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let content = '';
      let thinking = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const json = JSON.parse(data) as {
              choices?: {
                delta?: {
                  content?: string;
                  reasoning_content?: string;
                  reasoning?: string;
                };
              }[];
            };
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;
            const r = delta.reasoning_content || delta.reasoning || '';
            const c = delta.content || '';
            if (r) {
              thinking += r;
              opts.onReasoning?.(thinking, r);
            }
            if (c) {
              content += c;
              opts.onContent?.(content, c);
            }
          } catch {
            /* skip partial JSON */
          }
        }
      }

      if (!content.trim() && !thinking.trim()) {
        lastError = 'Empty stream from model.';
        continue;
      }
      return {
        ok: true,
        content: content.trim() || thinking.trim(),
        thinking: thinking.trim(),
        model,
      };
    } catch (err) {
      if (opts.signal?.aborted) {
        return { ok: false, error: 'Cancelled' };
      }
      lastError = String(err);
    }
  }

  return { ok: false, error: lastError };
}

/** Prepare text for Leo TTS — skip huge code dumps so Butler doesn't read raw HTML/JS aloud. */
export function textForSpeech(text: string): string {
  let t = text;
  // Replace fenced code blocks with a short note
  t = t.replace(/```[\s\S]*?```/g, ' [code block omitted for voice] ');
  // Collapse leftover long single-line code-ish runs
  if (t.length > 900) {
    t = t.slice(0, 900) + '… (reply shortened for voice — full text is in chat.)';
  }
  return t.replace(/\s+/g, ' ').trim();
}

export function buildSystemPrompt(opts: {
  projectName?: string | null;
  projectInstructions?: string | null;
  resumeNote?: string | null;
  folders?: string[];
  libraryFolders?: string[];
  displayReview?: string | null;
}): string {
  const parts = [
    'You are Butler Grok, a helpful, warm butler-style assistant.',
    'IMPORTANT CONTEXT: You are communicating through the **Butler Grok** desktop app — an unofficial Windows GUI for Grok Build / xAI (third-party, not an official xAI product). The user is often not a power user; keep language simple and practical.',
    'What Butler Grok provides to the user:',
    '- Docked chat (resizable) + optional floating chat window',
    '- Home desk panels: Folders, Saved/Recent conversations, Tasks, Projects, Currently Open, Marketplace, Display (media review with like/pass/choose)',
    '- Projects can have library folders for art review; Display tags media to projects',
    '- Slash commands: /project, /imagine, /like, /pass, /keep, /review, /save, /sessions, etc.',
    '- Modes: A = local Grok Build, B = xAI cloud API, C = both',
    '- Voice: user Speak (speech-to-text) and Butler Leo TTS when cloud mode + API key',
    'When the user asks you to open a panel or resume a project by name, Butler Grok may also perform UI actions (open panels). Acknowledge that naturally.',
    'When refining art, prefer items the user liked or chose; avoid regenerating options they passed on unless they ask to start over.',
    'When providing full code/HTML files, put them in fenced code blocks. Add a short plain-language summary outside the code so voice can read the summary without reading every line of code.',
  ];
  if (opts.projectName) {
    parts.push(`Active project: "${opts.projectName}".`);
    if (opts.projectInstructions) parts.push(`Project instructions:\n${opts.projectInstructions}`);
    if (opts.resumeNote) parts.push(`Resume / last section note: ${opts.resumeNote}`);
    if (opts.libraryFolders?.length) {
      parts.push(`Project library folders: ${opts.libraryFolders.join(', ')}`);
    }
  }
  if (opts.folders?.length) {
    parts.push(`Relevant PC folders the user selected:\n- ${opts.folders.join('\n- ')}`);
  }
  if (opts.displayReview) {
    parts.push(`Display review summary for this project:\n${opts.displayReview}`);
  }
  return parts.join('\n\n');
}

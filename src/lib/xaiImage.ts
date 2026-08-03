const XAI_IMAGES = 'https://api.x.ai/v1/images/generations';

const IMAGE_MODELS = ['grok-imagine-image-quality', 'grok-imagine-image'];

/**
 * Generate an image via xAI Imagine API.
 * Returns a URL or data URL for Display.
 */
export async function generateXaiImage(
  apiKey: string,
  prompt: string
): Promise<{ ok: true; url: string; model: string } | { ok: false; error: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: 'No API key. Add one in Settings (Mode B or C).' };
  const p = prompt.trim();
  if (!p) return { ok: false, error: 'Empty image prompt.' };

  let lastError = 'Unknown error';
  for (const model of IMAGE_MODELS) {
    try {
      const res = await fetch(XAI_IMAGES, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: p,
          n: 1,
          response_format: 'url',
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} (${model}): ${body.slice(0, 180)}`;
        if (res.status === 404) continue;
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            error: 'API key not allowed for image generation. Check xAI console permissions.',
          };
        }
        continue;
      }
      const data = (await res.json()) as {
        data?: { url?: string; b64_json?: string }[];
      };
      const first = data.data?.[0];
      if (first?.url) return { ok: true, url: first.url, model };
      if (first?.b64_json) {
        return {
          ok: true,
          url: `data:image/png;base64,${first.b64_json}`,
          model,
        };
      }
      lastError = 'Empty image response.';
    } catch (e) {
      lastError = String(e);
    }
  }
  return { ok: false, error: lastError };
}

/** Strip greetings / vocatives so intent can be found mid-sentence. */
function stripLeadIn(text: string): string {
  let t = text.trim();
  // Repeat a few times: "Hey Butler Grok, please …"
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(
        /^(?:hey|hi|hello|howdy|yo|ok|okay|please|thanks|thank\s+you)[,!.\s]+/i,
        ''
      )
      .replace(
        /^(?:butler\s*grok|butler|grok|sir|mate)[,!.\s]+/i,
        ''
      )
      .replace(/^(?:can\s+you|could\s+you|would\s+you|will\s+you)\s+/i, '')
      .replace(/^(?:please\s+)/i, '')
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function cleanPrompt(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/[.!?\s]+$/g, '')
    .trim();
}

/**
 * Detect “create/draw/generate an image” style requests — even after a greeting
 * like “Hey Butler Grok, create me an image of …”.
 */
export function detectImagePrompt(userText: string): string | null {
  const original = userText.trim();
  if (!original) return null;

  // Work on stripped lead-in first, then fall back to full text for mid-string match
  const candidates = [stripLeadIn(original), original];

  for (const t of candidates) {
    // Starts with create/generate/… image …
    const mStart =
      /^(?:create|generate|draw|make|paint|imagine)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|pic)\s*(?:of\s+|for\s+me[:\s]+|showing\s+|with\s+|:\s*)?([\s\S]+)$/i.exec(
        t
      );
    if (mStart?.[1] && cleanPrompt(mStart[1]).length > 1) {
      return cleanPrompt(mStart[1]);
    }

    const mForMe =
      /^(?:create|generate|draw|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|pic)\s+for\s+me\s*[:\-]?\s*["“]?([\s\S]+?)["”]?\s*$/i.exec(
        t
      );
    if (mForMe?.[1] && cleanPrompt(mForMe[1]).length > 1) {
      return cleanPrompt(mForMe[1]);
    }
  }

  // Anywhere in the message (handles “Hey … create me an image of a cat”)
  const mid =
    /(?:^|[\s,.!?;:])(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:create|generate|draw|make|paint|imagine)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|pic)\b(?:\s+(?:of|for\s+me|showing|with|that\s+shows?))?[:\s]*([\s\S]+)$/i.exec(
      original
    );
  if (mid?.[1] && cleanPrompt(mid[1]).length > 1) {
    return cleanPrompt(mid[1]);
  }

  // Quoted: create an image for me "a red car"
  const quoted = /(?:create|generate|draw|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo)\s+(?:for\s+me\s+)?["“]([\s\S]+?)["”]/i.exec(
    original
  );
  if (quoted?.[1] && cleanPrompt(quoted[1]).length > 1) {
    return cleanPrompt(quoted[1]);
  }

  return null;
}

/**
 * When a Display image is attached to chat: user wants to modify / recreate it
 * (not invent a brand-new unrelated image).
 */
export function detectAttachedImageEdit(userText: string): string | null {
  const t = userText.trim();
  if (!t) return null;
  const editish =
    /\b(recreate|re-create|redo|remake|modify|edit|change|update|tweak|adjust|vary|variant|revise|based on|same (?:one|image|picture)|this (?:one|image|picture|photo)|the (?:image|picture|one) i (?:liked|chose|picked|selected)|chosen (?:image|one)|with different|but with|make it|add .+ to it|remove .+ from it)\b/i.test(
      t
    );
  if (editish) return t;
  // Short follow-ups when an image is already attached
  if (t.length < 280 && /^(make|add|remove|change|put|replace|swap|fix|give)\b/i.test(t)) {
    return t;
  }
  return null;
}

/** Build an Imagine prompt that keeps the attached image as the subject. */
export function buildEditPromptFromAttachment(
  userText: string,
  attachment: { title?: string; src?: string }
): string {
  const title = (attachment.title || 'reference image').slice(0, 120);
  return [
    `Create a NEW image that is a clear variation of the user's chosen reference image titled "${title}".`,
    `User modification request: ${userText.trim()}`,
    'Keep the same main subject, composition, and overall style unless the user explicitly asks to change them.',
    'Do not invent a completely different scene; this is an edit/recreate of their selected image.',
    attachment.src ? `Reference image URL (identity): ${attachment.src.slice(0, 500)}` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

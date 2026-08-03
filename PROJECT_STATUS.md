# Butler Grok — Project status (public)

**Purpose:** Continuity for humans and coding agents.  
**Product version:** 0.1.x  
**License:** MIT (third-party; not official xAI)

---

## What it is

Windows **Electron + React + Vite** app: a butler-themed desk for Grok Build and optional xAI cloud (chat, Leo TTS, Imagine).

## What’s working (high level)

- Home desk, floating/OS panels, docked chat  
- Modes A / B / C, Settings, first-run wizard  
- Slash commands (`/imagine`, `/project`, `/like`, `/review`, `/save`, …)  
- Speak: Enter stops recording, Enter again sends  
- Projects: continue/new chat, chat list, Save as project from general chat  
- Per-project Display (`projdisp:<id>`) + General Display  
- Library folders, votes, Bring to chat / drag-to-chat for image recreate  
- Butler pose videos + stills; welcome tray animation  
- Grok CLI helpers (update/marketplace paste flow; Open Grok Build for project)  

## Good next steps for contributors

1. Harden **Open Grok Build** UX (taskbar visibility, docs screenshots)  
2. True image **edit** API if/when xAI exposes a stable edit endpoint (today: grounded Imagine prompt from attachment)  
3. Project **boards** (review packs of N options)  
4. Nested library folders  
5. Better empty states / onboarding  
6. Optional portable data path only (already partially supported)  
7. Tests (unit for slash + image detect; smoke e2e)  
8. Linux/mac exploration (not primary yet)  

## Architecture reminders

- Renderer must not hold secrets in git; keys in Settings → local JSON under Data/  
- Prefer small PRs; keep language simple in UI strings  

## Disclaimer

Community project. Grok / xAI / X names belong to their owners.

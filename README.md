# Butler Grok

**A friendlier Windows desktop home for [Grok Build](https://grok.com)** — projects, chat, tasks, Display review, and a butler character that talks back.

> **Unofficial, third-party open source.**  
> Not affiliated with, endorsed by, or an official product of **xAI**, **X**, **SpaceX**, or **Grok**.  
> Built for people who want Grok Build power without living only in a pure terminal UI.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform: Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-informational)
![Stack: Electron + React](https://img.shields.io/badge/stack-Electron%20%2B%20React%20%2B%20Vite-black)

---


## Screenshot

![Butler Grok desk](docs/screenshots/butler-grok-desk.png)
## Why this exists

Grok Build is powerful. Butler Grok is the **noob-friendly desk** around it:

- Docked chat + optional floating chat  
- **Projects** with their own chats, Display gallery, and library folders  
- **Display** for reviewing images/video (like / pass / keep, bring to chat)  
- Tasks, folders, marketplace helpers  
- Modes: local Grok CLI, xAI cloud API, or both  
- Animated butler (stills + short video loops)

X / Grok Build users asked for something approachable — this is that starting point. **PRs and forks welcome.**

---

## Requirements

| Need | Notes |
|------|--------|
| **Windows 10/11** (64-bit) | Primary target |
| **Node.js 20+** | For development |
| **Grok Build CLI** (`grok` on PATH) | Mode A / C, marketplace, project Grok terminal |
| **xAI API key** (optional) | Mode B / C — cloud chat, Leo voice, Imagine |

---

## Quick start (developers)

```powershell
git clone https://github.com/OsheaDavis/butler-grok.git
cd butler-grok
npm install
npm run dev
```

This starts Vite + Electron. The first run opens a short wizard.

### Production-style run (no installer)

```powershell
npm run start:prod
```

### Build installer

```powershell
npm run pack
```

Output: `release\ButlerGrok-Setup-0.1.0.exe`  
Windows builds are **unsigned** by default — SmartScreen may warn on your own builds.

---

## Connection modes

| Mode | Meaning |
|------|---------|
| **A** | Local Grok Build only |
| **B** | xAI cloud API (paste key in **Settings**; turn **Demo mode Off**) |
| **C** | Both |

**Never commit API keys.** Enter them only in Settings. See `.env.example` for optional local-only env testing.

---

## Where your data lives

User chats, settings, and media cache are **local** and **gitignored**:

1. `BUTLER_DATA_DIR` environment variable, if set  
2. Else legacy: `C:\Grok Build\Butler Grok\Data\` (if that tree already exists)  
3. Else: Electron `userData\Data\` (new contributors)

Do not upload `Data/` — it may contain keys and personal chats.

---

## Repo layout

```
butler-grok/
  assets/           # Butler images + video loops (publicDir for Vite)
  electron/         # Main process, preload, storage
  src/              # React UI (panels, chat, Display, store)
  Data/.gitkeep     # Placeholder only
  PROJECT_STATUS.md # Continuity notes for agents/contributors
  CONTRIBUTING.md   # How to help
```

---

## Features (snapshot)

- Home desk with rearrangeable tiles  
- Chat: slash commands (`/imagine`, `/project`, `/like`, `/review`, …), Speak (Enter to stop, Enter to send)  
- Projects: continue/new chat, per-project Display, library folders, “Open Grok Build” for a project terminal  
- Display: general vs project-scoped panels, votes, fullscreen, **Bring to chat** for image edits  
- Grok CLI helpers (update / marketplace via new-tab paste where needed)

Details and roadmap live in [`PROJECT_STATUS.md`](./PROJECT_STATUS.md).

---

## Contributing

See **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

High-level: small focused PRs, no secrets, keep the UI approachable for non-programmers while leaving room for power users.

If you use **Grok Build** as your coding agent, point it at this repo and `PROJECT_STATUS.md` / `CONTRIBUTING.md`.

---

## Security & privacy

- API keys stay in local Settings / `Data/`  
- `.gitignore` excludes `Data/`, `.env`, build outputs  
- Review your own `Data/settings.json` before any backup you share  

---

## License

[MIT](./LICENSE) — Â© Butler Grok contributors.

Character art and media under `assets/` are project assets for this app; if you replace them, keep licensing clear in your fork.

---

## Disclaimer

Butler Grok is a community interface for people who also use Grok Build / xAI tools. Product names mentioned belong to their owners. Use at your own risk; this software is provided as-is under MIT.


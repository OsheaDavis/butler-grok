# Notes for coding agents (Grok Build, etc.)

This file is for **AI coding agents** working in this repository.

## Product intent

Butler Grok is an **unofficial Electron desktop GUI** around Grok Build / xAI. Prioritize:

1. **Approachability** — non-programmers should not feel lost  
2. **Projects as workspaces** — chat + Display + folders scoped per project  
3. **Local-first data** — never invent cloud storage; never log API keys  

## Do / don’t

| Do | Don’t |
|----|--------|
| Read `PROJECT_STATUS.md` for continuity | Commit `Data/`, `.env`, or keys |
| Keep `npm run build` green | Break Mode A (no API key) for simple demos |
| Prefer small, reviewable diffs | Rewrite the whole app unprompted |
| Update docs when behavior changes | Hardcode a contributor’s personal paths or names |

## Architecture map

- `electron/main.cjs` — app lifecycle; registers IPC modules  
- `electron/windows.cjs` — main/panel windows, tray, work-area insets  
- `electron/coreIpc.cjs` — storage, secrets, xAI stream, dialogs  
- `electron/grokIpc.cjs` / `grokShell.cjs` — Grok CLI / terminal helpers  
- `electron/mediaIpc.cjs` — media save/resolve  
- `electron/leoPlayback.cjs` — Leo TTS stream + MediaPlayer (safeStorage key stays in main)  
- `electron/preload.cjs` — `window.butler` bridge (unchanged IPC surface)  
- `src/hooks/useAppStore.ts` — composing store hook  
- `src/hooks/store/*` — persist, slash/sendChat, display, conversation helpers  
- `src/components/panels/*` — Folders / Conversations / Projects / Tasks / Marketplace bodies  
- `src/components/chat/*` — ChatDock toolbar / transcript / compose / Speak STT  
- `src/components/app/*` — desk, title bar, tile summaries, panel body router  
- `src/lib/*` — slash commands, xAI chat/image, limits, types  
- `assets/` — Vite `publicDir` (images + butler video loops)  

## Data directory

Resolved in `electron/main.cjs` (`BUTLER_DATA_DIR` → legacy `C:\Grok Build\Butler Grok\Data` → Electron userData).  
User settings JSON must not include API keys. Keys are stored via Electron `safeStorage` under userData — **never read them into commits or logs.**

## Common tasks

- **New slash command:** `src/lib/slashCommands.ts` + handler in `useAppStore.sendChat`  
- **New panel:** `types.ts` PanelId + `App.tsx` `renderBody` + home tile if needed  
- **Project Display:** panel id `projdisp:<projectId>` via `projectDisplayPanelId()`  
- **Butler clips:** `assets/video/` + `src/lib/butlerVideos.ts`  

## Verification

After code changes:

```powershell
npm test
npm run build
```

`npm test` runs Vitest (`vitest run`) — unit tests for speech sentences, Leo stream helpers, store/panel/home helpers. Not Electron E2E.

Optional: `npm run dev` and smoke-test chat + one project Display.

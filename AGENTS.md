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

- `electron/main.cjs` — windows, IPC, Grok CLI helpers, Leo TTS playback, storage paths  
- `electron/preload.cjs` — `window.butler` bridge  
- `src/hooks/useAppStore.ts` — app state, chat, projects, Display  
- `src/components/*` — UI panels  
- `src/lib/*` — slash commands, xAI chat/image, limits, types  
- `assets/` — Vite `publicDir` (images + butler video loops)  

## Data directory

Resolved in `electron/main.cjs` (`BUTLER_DATA_DIR` → legacy `C:\Grok Build\Butler Grok\Data` → Electron userData).  
User settings include API keys — **never read them into commits or logs.**

## Common tasks

- **New slash command:** `src/lib/slashCommands.ts` + handler in `useAppStore.sendChat`  
- **New panel:** `types.ts` PanelId + `App.tsx` `renderBody` + home tile if needed  
- **Project Display:** panel id `projdisp:<projectId>` via `projectDisplayPanelId()`  
- **Butler clips:** `assets/video/` + `src/lib/butlerVideos.ts`  

## Verification

After code changes:

```powershell
npm run build
```

Optional: `npm run dev` and smoke-test chat + one project Display.

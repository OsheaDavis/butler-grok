# Contributing to Butler Grok

Thanks for helping make Grok Build more approachable.

## Before you start

1. Read the [README](./README.md) and skim [PROJECT_STATUS.md](./PROJECT_STATUS.md).  
2. Run the app locally (`npm install` → `npm run dev`).  
3. Prefer **small, focused changes** with a clear “why” for non-experts.

## Dev setup

```powershell
npm install
npm run dev          # Electron + Vite HMR
npm run build        # typecheck + production UI bundle
npm run start:prod   # run packaged UI path
```

### Windows notes

- **Grok CLI:** install Grok Build so `grok` resolves (often `%USERPROFILE%\.grok\bin`).  
- **API key:** Settings only — never commit.  
- **Data folder:** auto-created; never commit `Data/`.

## What to work on

Good first areas:

| Area | Ideas |
|------|--------|
| UX copy | Clearer empty states, first-run tips |
| Projects | Chat lists, Display folders, Grok-for-project reliability |
| Display | Review boards, multi-select, 3D placeholders |
| Chat | Slash commands, attachment / edit flow |
| Accessibility | Keyboard paths, contrast |
| Docs | Screenshots, short videos, non-English README |

Avoid:

- Committing API keys, personal chats, or `Data/`  
- Huge unrelated refactors in one PR  
- Official-looking xAI branding that implies endorsement  

## Pull request checklist

- [ ] `npm run build` succeeds  
- [ ] No secrets in the diff  
- [ ] UI still makes sense for a non-power user  
- [ ] Short description of **what** and **why**  
- [ ] If you change behavior, update `PROJECT_STATUS.md` or README  

## Code style

- TypeScript + React function components  
- Electron main process: `electron/*.cjs` (CommonJS)  
- Prefer readable names over cleverness  
- Keep side effects (TTS, file IO, CLI) behind clear store/main helpers  

## Using Grok Build to contribute

You can open this repo in Grok Build and ask it to implement a small issue.

Suggested prompt:

```text
Read CONTRIBUTING.md and PROJECT_STATUS.md.
Implement only: <one clear task>.
Do not commit secrets or touch Data/.
Run npm run build when done.
```

## Code of conduct (short)

Be kind. Help beginners. Assume good intent. No harassment.

## License

By contributing, you agree your contributions are under the same **MIT** license as the project.

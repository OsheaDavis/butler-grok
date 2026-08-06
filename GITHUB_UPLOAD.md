# Upload this folder to GitHub

This directory is a **clean copy** of Butler Grok for public sharing.

## Path on your PC

```
C:\Grok Build\butler-grok
```

Your daily working copy (with personal Data) remains:

```
C:\Grok Build\Butler Grok
```

## One-time publish (GitHub)

1. Create a **new empty repository** on GitHub (e.g. `butler-grok`).  
   - Public or private — your choice.  
   - Do **not** add a README on GitHub if you will push this folder (avoids merge conflicts).

2. In PowerShell:

```powershell
cd "C:\Grok Build\butler-grok"

git init
git add .
git status
# Confirm: NO Data/settings.json, NO node_modules, NO API keys

git commit -m "Initial public release of Butler Grok (unofficial Grok Build desktop GUI)"

git branch -M main
git remote add origin https://github.com/oshea-davis/butler-grok.git
git push -u origin main
```

3. On the GitHub repo page, add topics such as: `grok`, `xai`, `electron`, `desktop`, `windows`.

4. Optional: create a Release and attach `ButlerGrok-Setup-*.exe` after you run `npm run pack` **locally** (do not commit `release/`).

## Safety checklist before every push

- [ ] `Data/` is not staged (should be gitignored)  
- [ ] No real `xai-…` keys in any file  
- [ ] `git status` looks like source + assets + docs only  

## Keeping your private app and the GitHub copy in sync

- Develop day-to-day in `C:\Grok Build\Butler Grok` if you want.  
- When ready to share a change, copy **only** the intended source files into `butler-grok`, or work **in** `butler-grok` and keep personal data only in `Data/`.  
- Never copy `Data\settings.json` into the public tree.

## What others should run

See **README.md** — `npm install` → `npm run dev`.


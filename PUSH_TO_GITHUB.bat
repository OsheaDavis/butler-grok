@echo off
setlocal EnableExtensions
title Butler Grok - Push to GitHub
cd /d "%~dp0"

echo.
echo ============================================================
echo   Butler Grok - Upload everything to GitHub
echo ============================================================
echo.
echo   Repo:   https://github.com/oshea-davis/butler-grok
echo   Folder: %CD%
echo.
echo   A GitHub sign-in window may open in your browser.
echo   Sign in with the account: oshea-davis
echo   Then come back here and wait for SUCCESS.
echo.
echo ============================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed.
  echo.
  echo 1. Install Git from: https://git-scm.com/download/win
  echo 2. Restart this PC or open a new Command Prompt
  echo 3. Double-click this file again
  echo.
  pause
  exit /b 1
)

git remote remove origin 2>nul
git remote add origin https://github.com/oshea-davis/butler-grok.git

echo Checking files...
git status -sb
echo.

echo Making sure everything is committed...
git add -A
git status -sb
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Sync local butler-grok for GitHub publish"
)

echo.
echo Pushing to GitHub (this may open a login window)...
echo.

REM Force is OK here: this folder is the clean public copy; remote may have
REM partial uploads from API that do not match local history.
git -c credential.helper=manager push -u origin main --force
if errorlevel 1 (
  echo.
  echo ============================================================
  echo   Push failed. Easiest fix for first-timers:
  echo ============================================================
  echo.
  echo   Option A - GitHub Desktop (recommended if you are new)
  echo     1. Install: https://desktop.github.com
  echo     2. Sign in as oshea-davis
  echo     3. File -^> Add Local Repository
  echo     4. Choose this folder:
  echo        C:\Grok Build\butler-grok
  echo     5. Click "Publish branch" or "Push origin"
  echo        If it warns about force, allow overwriting the remote
  echo        (this folder is the correct full project).
  echo.
  echo   Option B - Try this bat again after signing in once in a browser
  echo     at https://github.com/login
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   SUCCESS! Your project is on GitHub.
echo ============================================================
echo.
echo   Open: https://github.com/oshea-davis/butler-grok
echo.
start https://github.com/oshea-davis/butler-grok
pause

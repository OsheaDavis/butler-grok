@echo off
setlocal EnableExtensions
title Butler Grok - Push to GitHub
cd /d "%~dp0"

echo.
echo === Butler Grok - Upload to GitHub ===
echo.
echo Repo: https://github.com/oshea-davis/butler-grok
echo Folder: %CD%
echo.
echo This will open a GitHub login window if needed, then upload the project.
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git is not installed.
  echo Install from https://git-scm.com/download/win then run this again.
  pause
  exit /b 1
)

git remote remove origin 2>nul
git remote add origin https://github.com/oshea-davis/butler-grok.git

echo Checking status...
git status -sb
echo.

echo Pushing to GitHub (sign in if a browser/window appears)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo Push failed. Try one of these:
  echo   1. Install GitHub Desktop, sign in, File -^> Add Local Repository -^> this folder -^> Publish
  echo   2. Or run:  git push -u origin main
  echo.
  pause
  exit /b 1
)

echo.
echo SUCCESS! Open: https://github.com/oshea-davis/butler-grok
echo.
start https://github.com/oshea-davis/butler-grok
pause

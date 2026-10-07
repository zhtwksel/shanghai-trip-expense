@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
 node serve.mjs
) else (
 if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" serve.mjs
 ) else (
  echo Node.js 22.12 or newer is required.
  pause
 )
)

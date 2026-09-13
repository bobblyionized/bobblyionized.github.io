@echo off
REM Build index.html from src/ and push it to GitHub (volleyballgaem.github.io).
REM Usage:  deploy            -> commit message "Update game"
REM         deploy your message here
cd /d "%~dp0"
python build.py || exit /b 1
git add -A
set MSG=%*
if "%MSG%"=="" set MSG=Update game
git commit -m "%MSG%" || echo (nothing to commit)
git pull --rebase origin main
git push origin main

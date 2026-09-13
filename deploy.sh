#!/usr/bin/env bash
# Build index.html from src/ and push it to GitHub. Usage: ./deploy.sh ["commit message"]
cd "$(dirname "$0")"
python build.py || exit 1
git add -A
git commit -m "${*:-Update game}" || echo "(nothing to commit)"
git pull --rebase origin main && git push origin main
